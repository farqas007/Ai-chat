/* ===========================================================
   Regression test for the duplicate user-message race.

   A rapid, identical resubmission (double-tap / repeating
   keyboard keydown) can slip past the send lock when the first
   request fails fast and releases the lock before the second
   submission arrives. The guard in app.js must ignore an
   identical message resubmitted within ~1000ms of the previous
   accepted identical message, while never blocking different
   messages or repeated sends after the window has expired.
=========================================================== */


globalThis.window = globalThis;

globalThis.speechSynthesis = {
    getVoices: () => [],
    cancel: () => {},
    speak: () => {},
    pause: () => {},
    resume: () => {},
    onvoiceschanged: null
};

globalThis.localStorage = (() => {
    const map = new Map();
    return {
        getItem: k => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: k => map.delete(k),
        clear: () => map.clear(),
        length: 0
    };
})();

globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
        className: "", innerHTML: "", style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {}, addEventListener() {},
        setAttribute() {}, remove() {}, focus() {},
        querySelector: () => null
    }),
    addEventListener() {},
    body: { appendChild() {}, style: {} }
};


import { App } from "../js/app.js";
import { Chat } from "../js/chat.js";
import Events from "../js/events.js";


const passed = [];
const failed = [];

function assert(name, condition) {
    if (condition) {
        passed.push(name);
        console.log(`PASS: ${name}`);
    } else {
        failed.push(name);
        console.log(`FAIL: ${name}`);
    }
}

function settle(ms = 20) {
    return new Promise(r => setTimeout(r, ms));
}


function createHarness() {

    const store = { chats: [], current: null };

    const storage = {
        getChats: () => store.chats,
        saveChats: chats => {
            store.chats = chats.map(chat => ({
                ...chat,
                messages: chat.messages.map(m => ({ ...m }))
            }));
            return true;
        },
        setCurrentChat: id => { store.current = id; },
        getCurrentChat: () => store.current
    };

    const calls = {
        typing: [], errors: [], sending: [], hideError: 0,
        removeMessage: [], streamUpdated: [], rendered: []
    };

    const ui = {
        showTyping: v => calls.typing.push(v),
        showError: m => calls.errors.push(m),
        hideError: () => { calls.hideError++; },
        setSending: v => calls.sending.push(v),
        removeMessage: id => calls.removeMessage.push(id),
        updateStreamingMessage: (id, html) => calls.streamUpdated.push([id, html]),
        renderChat: messages => calls.rendered.push([...messages]),
        appendMessage() {}, updateMessage() {}, clearMessages() {},
        showEmptyState() {}, setTitle() {}, scrollToBottom() {},
        setUnreadBadge() {},
        markdown: { render: t => t }
    };


    const app = new App();

    const chat = new Chat();

    chat.connect({ storage, ui });

    app.chat = chat;
    app.ui = ui;
    app.markdown = { render: t => t };
    app.codeblock = { refresh() {} };
    app.voice = {
        speak() {}, stopSpeaking() {}, destroy() {},
        detector: { detect: () => ({}) },
        player: { pause() {}, resume() {} },
        config: { paused: false }
    };
    app.api = { sendWithRetry: async () => "<p>ok</p>" };

    app.registerEvents();

    function resetCalls() {
        calls.typing = [];
        calls.errors = [];
        calls.sending = [];
        calls.hideError = 0;
        calls.removeMessage = [];
        calls.streamUpdated = [];
        calls.rendered = [];
    }

    return { app, chat, storage, store, calls, ui, resetCalls };

}


function findChat(store, id) {
    return store.chats.find(c => c.id === id);
}


const h = createHarness();

const { app, chat, store, calls } = h;


function userMessages(store, id) {
    return findChat(store, id).messages.filter(m => m.role === "user");
}


/* ===========================================================
   RUN ALL TESTS
=========================================================== */

/* -----------------------------------------------------------
   TEST 1 — A normal single submission sends exactly once.
----------------------------------------------------------- */

async function testSingleSubmission() {

    h.resetCalls();

    const a = chat.createChat("Single Chat");

    let apiCalls = 0;

    app.api.sendWithRetry = async () => {
        apiCalls++;
        return "<p>ok</p>";
    };

    Events.emit("chat:send", "single hello");

    await settle();

    const msgs = findChat(store, a.id).messages;

    assert(
        "T1 exactly one user message stored",
        userMessages(store, a.id).length === 1
    );

    assert(
        "T1 exactly one assistant reply stored",
        msgs.filter(m => m.role === "assistant").length === 1
    );

    assert(
        "T1 backend contacted exactly once",
        apiCalls === 1
    );

    assert(
        "T1 send lock released",
        app.state.sending === false
    );

}


/* -----------------------------------------------------------
   TEST 2 — Rapid identical duplicate submission (first
   request fails fast, releasing the lock) is suppressed so the
   user message is NOT appended twice and the backend is NOT
   contacted twice.
----------------------------------------------------------- */

async function testRapidIdenticalDuplicateSuppressed() {

    h.resetCalls();

    const a = chat.createChat("Race Chat");

    let apiCalls = 0;

    let firstRequest = true;

    app.api.sendWithRetry = async () => {
        apiCalls++;
        if (firstRequest) {
            firstRequest = false;
            throw new Error("fast temporary failure");
        }
        return "<p>reply</p>";
    };

    // First submission creates the user bubble and fails fast,
    // which releases the send lock.
    Events.emit("chat:send", "Hello, how are you?");

    await settle();

    assert(
        "T2 lock released after fast failure",
        app.state.sending === false
    );

    assert(
        "T2 failure surfaced",
        calls.errors.includes("fast temporary failure")
    );

    // Second, identical submission inside the guard window must
    // be ignored (this is the duplicate-bubble race).
    const errorsBeforeResubmit = calls.errors.length;

    Events.emit("chat:send", "Hello, how are you?");

    await settle();

    assert(
        "T2 suppressed resubmission raises no new error",
        calls.errors.length === errorsBeforeResubmit
    );

    const msgs = findChat(store, a.id).messages;

    assert(
        "T2 duplicate user message NOT appended",
        userMessages(store, a.id).length === 1
    );

    assert(
        "T2 backend contacted exactly once despite resubmission",
        apiCalls === 1
    );

    assert(
        "T2 only one user bubble in stored chat",
        msgs.filter(m => m.content === "Hello, how are you?").length === 1
    );

}


/* -----------------------------------------------------------
   TEST 3 — The same message may be sent again (and produces a
   new user message) once the guard window has elapsed.
----------------------------------------------------------- */

async function testSameMessageAfterWindow() {

    h.resetCalls();

    const a = chat.createChat("Window Chat");

    let apiCalls = 0;

    app.api.sendWithRetry = async () => {
        apiCalls++;
        return "<p>ok</p>";
    };

    Events.emit("chat:send", "retry me");

    await settle();

    // Wait out the ~1000ms guard window.
    await settle(1100);

    // Identical text, well after the window: must be accepted.
    Events.emit("chat:send", "retry me");

    await settle();

    const msgs = findChat(store, a.id).messages;

    assert(
        "T3 identical message accepted after the guard window",
        msgs.filter(m => m.role === "user").length === 2
    );

    assert(
        "T3 both sends reached the backend",
        apiCalls === 2
    );

    assert(
        "T3 two assistant replies present",
        msgs.filter(m => m.role === "assistant").length === 2
    );

}


/* -----------------------------------------------------------
   TEST 4 — A different message inside the guard window is NOT
   blocked.
----------------------------------------------------------- */

async function testDifferentMessageNotBlocked() {

    h.resetCalls();

    const a = chat.createChat("Different Chat");

    let apiCalls = 0;

    app.api.sendWithRetry = async () => {
        apiCalls++;
        return "<p>ok</p>";
    };

    Events.emit("chat:send", "first message");

    await settle();

    // Different text, immediately (inside the guard window).
    Events.emit("chat:send", "a different message");

    await settle();

    const msgs = findChat(store, a.id).messages;

    assert(
        "T4 different message not blocked",
        msgs.filter(m => m.role === "user").length === 2
    );

    assert(
        "T4 backend contacted once per message",
        apiCalls === 2
    );

    assert(
        "T4 both user texts stored",
        msgs.some(m => m.content === "first message") &&
        msgs.some(m => m.content === "a different message")
    );

}


await testSingleSubmission();

await testRapidIdenticalDuplicateSuppressed();

await testSameMessageAfterWindow();

await testDifferentMessageNotBlocked();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}