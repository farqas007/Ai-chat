/* ===========================================================
   End-to-end flow test for UI-01 + UI-02 fixes.

   Builds the REAL App (with Node stubs standing in for the DOM)
   and drives real chat/typing/error events through app.js's
   registerEvents() so the shipped wiring is what is under test.
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
    createElement: () => {
        const el = {
            className: "", style: {},
            _html: "", _text: "",
            classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
            appendChild() {}, addEventListener() {},
            setAttribute() {}, remove() {}, focus() {},
            querySelector: () => null
        };
        Object.defineProperty(el, "innerHTML", {
            get: () => el._html,
            set: value => {
                el._html = value;
                // A real element derives textContent from innerHTML
                // after tags are stripped; the ai:request handler
                // reads temp.textContent to build the speech text.
                el._text = String(value)
                    .replace(/<[^>]+>/g, " ")
                    .replace(/&nbsp;/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
            }
        });
        Object.defineProperty(el, "textContent", {
            get: () => el._text,
            set: value => { el._text = value; }
        });
        return el;
    },
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
        removeMessage: []
    };

    const ui = {
        showTyping: v => calls.typing.push(v),
        showError: m => calls.errors.push(m),
        hideError: () => { calls.hideError++; },
        setSending: v => calls.sending.push(v),
        removeMessage: id => calls.removeMessage.push(id),
        appendMessage() {}, updateStreamingMessage() {},
        updateMessage() {}, renderChat() {}, clearMessages() {},
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
    app.api = {
        streamMessage: async (_m, _h, callbacks) => {
            callbacks.onDone("<p>ok</p>");
            return "<p>ok</p>";
        }
    };

    app.registerEvents();

    function resetCalls() {
        calls.typing = [];
        calls.errors = [];
        calls.sending = [];
        calls.hideError = 0;
        calls.removeMessage = [];
    }

    return { app, chat, storage, store, calls, ui, resetCalls };

}


function findChat(store, id) {
    return store.chats.find(c => c.id === id);
}


const h = createHarness();

const { app, chat, store, calls } = h;


/* ===========================================================
   SCENARIO 1 — Successful send
=========================================================== */

async function scenarioSuccess() {

    h.resetCalls();

    const c = chat.createChat("Success Chat");

    app.api.streamMessage = async (_m, _h, callbacks) => {
        callbacks.onDone("<p>Hello back</p>");
        return "<p>Hello back</p>";
    };

    Events.emit("chat:send", "Hello there");

    await settle();

    const messages = findChat(store, c.id).messages;

    assert(
        "S1 user message persisted",
        messages.length === 2 && messages[0].role === "user"
    );

    assert(
        "S1 assistant message persisted with content",
        messages.length === 2 &&
        messages[1].role === "assistant" &&
        messages[1].content === "<p>Hello back</p>"
    );

    assert(
        "S1 typing indicator shown then hidden (ui:typing wiring)",
        calls.typing.includes(true) && calls.typing.includes(false)
    );

    assert(
        "S1 send lock enabled then released",
        calls.sending[0] === true && calls.sending[calls.sending.length - 1] === false
    );

    assert(
        "S1 error cleared at request start",
        calls.hideError >= 1
    );

    assert(
        "S1 no error shown on success",
        calls.errors.length === 0
    );

    assert(
        "S1 no empty assistant left behind",
        findChat(store, c.id).messages.every(m => m.content !== "")
    );

}


/* ===========================================================
   SCENARIO 2 — API failure
=========================================================== */

async function scenarioFailure() {

    h.resetCalls();

    const c = chat.createChat("Failure Chat");

    app.api.streamMessage = async (_m, _h, callbacks) => {
        const err = new Error("boom");
        callbacks.onError(err);
        throw err;
    };

    Events.emit("chat:send", "make it fail");

    await settle();

    const messages = findChat(store, c.id).messages;

    assert(
        "S2 user message kept after failure",
        messages.length === 1 && messages[0].role === "user"
    );

    assert(
        "S2 empty assistant rolled back",
        messages.length === 1 && messages[0].content === "make it fail"
    );

    assert(
        "S2 error surfaced through chat:error",
        calls.errors.includes("boom")
    );

    assert(
        "S2 typing indicator hidden after failure",
        calls.typing[calls.typing.length - 1] === false
    );

    assert(
        "S2 send lock released after failure",
        app.state.sending === false &&
        calls.sending[calls.sending.length - 1] === false
    );

    assert(
        "S2 persisted store has no empty assistant",
        findChat(store, c.id).messages.every(m => m.content !== "")
    );

}


/* ===========================================================
   SCENARIO 3 — Rapid double send while request is in flight
=========================================================== */

async function scenarioDoubleSend() {

    h.resetCalls();

    let releaseRequest = null;
    let apiCalls = 0;

    app.api.streamMessage = (message, history, callbacks) => {
        apiCalls++;
        return new Promise(resolve => {
            releaseRequest = () => {
                callbacks.onDone("<p>Done</p>");
                resolve("<p>Done</p>");
            };
        });
    };

    const c = chat.createChat("Double Send Chat");

    Events.emit("chat:send", "first");

    Events.emit("chat:send", "second");

    assert(
        "S3 send lock held while request in flight",
        app.state.sending === true
    );

    assert(
        "S3 only one API call dispatched",
        apiCalls === 1
    );

    assert(
        "S3 only one user message added",
        findChat(store, c.id).messages.filter(m => m.role === "user").length === 1
    );

    assert(
        "S3 duplicate send ignored (second message not added)",
        findChat(store, c.id).messages.every(m => m.content !== "second")
    );

    releaseRequest();

    await settle();

    const messages = findChat(store, c.id).messages;

    assert(
        "S3 single assistant message completes",
        messages.length === 2 &&
        messages[1].role === "assistant" &&
        messages[1].content === "<p>Done</p>"
    );

    assert(
        "S3 lock released after completion",
        app.state.sending === false
    );

}


/* ===========================================================
   SCENARIO 4 — Switch chats before request completes (failure)
=========================================================== */

async function scenarioChatSwitch() {

    h.resetCalls();

    let failRequest = null;

    app.api.streamMessage = (_m, _h, callbacks) => new Promise((resolve, reject) => {
        failRequest = () => {
            const err = new Error("switched away");
            callbacks.onError(err);
            reject(err);
        };
    });

    const a = chat.createChat("Chat A");

    Events.emit("chat:send", "send in A");

    // The empty assistant placeholder now lives in chat A.
    assert(
        "S4 placeholder created in originating chat A",
        findChat(store, a.id).messages.length === 2
    );

    const b = chat.createChat("Chat B");

    failRequest();

    await settle();

    const aMessages = findChat(store, a.id).messages;
    const bMessages = findChat(store, b.id).messages;

    assert(
        "S4 rollback targets originating chat A (user kept, empty removed)",
        aMessages.length === 1 &&
        aMessages[0].role === "user" &&
        aMessages[0].content === "send in A"
    );

    assert(
        "S4 chat B untouched by A's failure",
        bMessages.length === 0
    );

    assert(
        "S4 no DOM removal while a different chat is active",
        calls.removeMessage.length === 0
    );

    assert(
        "S4 error still surfaced after switch",
        calls.errors.includes("switched away")
    );

    assert(
        "S4 lock released after switch + failure",
        app.state.sending === false
    );

}


/* ===========================================================
   SCENARIO 5 — Reload after a failed request
=========================================================== */

async function scenarioReload() {

    h.resetCalls();

    const c = chat.createChat("Reload Chat");

    app.api.streamMessage = async (_m, _h, callbacks) => {
        const err = new Error("reload fail");
        callbacks.onError(err);
        throw err;
    };

    Events.emit("chat:send", "this will fail");

    await settle();

    // Simulate a full page reload: fresh Chat reading the persisted store.
    const freshChat = new Chat();

    freshChat.connect({
        storage: h.storage,
        ui: { appendMessage() {}, renderChat() {} }
    });

    freshChat.loadChats();

    const restored = freshChat.state.chats.find(x => x.id === c.id);

    assert(
        "S5 reload restores only persisted user message",
        restored && restored.messages.length === 1 &&
        restored.messages[0].role === "user"
    );

    assert(
        "S5 reload has no empty assistant ghost",
        restored.messages.every(m => m.content !== "")
    );

}


/* ===========================================================
   SCENARIO 6 — Sound OFF: assistant reply is never spoken
=========================================================== */

async function scenarioSoundDisabled() {

    h.resetCalls();

    let speechCount = 0;

    app.voice.speak = () => { speechCount++; };

    app.settings.set("sound", false);

    app.api.streamMessage = async (_m, _h, callbacks) => {
        callbacks.onDone("<p>Spoken reply</p>");
        return "<p>Spoken reply</p>";
    };

    const c = chat.createChat("Sound Off Chat");

    Events.emit("chat:send", "please answer");

    await settle();

    assert(
        "S6 no speech when sound disabled",
        speechCount === 0
    );

    assert(
        "S6 reply rendered normally",
        findChat(store, c.id).messages.length === 2 &&
        findChat(store, c.id).messages[1].content === "<p>Spoken reply</p>"
    );

}


/* ===========================================================
   SCENARIO 7 — Sound ON: assistant reply is spoken once
=========================================================== */

async function scenarioSoundEnabled() {

    h.resetCalls();

    let speechText = null;

    app.voice.speak = text => { speechText = text; };

    app.settings.set("sound", true);

    app.api.streamMessage = async (_m, _h, callbacks) => {
        callbacks.onDone("<p>Hello there</p>");
        return "<p>Hello there</p>";
    };

    const c = chat.createChat("Sound On Chat");

    Events.emit("chat:send", "say hello");

    await settle();

    assert(
        "S7 one speak call when sound enabled",
        speechText !== null
    );

    assert(
        "S7 spoken text is tag-free plain text",
        speechText === "Hello there"
    );

    app.settings.set("sound", false);

}


/* ===========================================================
   SCENARIO 8 — Error path explicitly clears typing indicator
   even when no request was ever accepted by the UI
=========================================================== */

async function scenarioErrorClearsTyping() {

    h.resetCalls();

    const c = chat.createChat("Stuck Typing Chat");

    app.api.streamMessage = async (_m, _h, callbacks) => {
        const err = new Error("hard fail");
        callbacks.onError(err);
        throw err;
    };

    // Drive the request directly (bypassing the composer) to prove the
    // ai:request error path itself clears the indicator.
    Events.emit("chat:send", "trigger failure");

    await settle();

    const typingHistory = calls.typing.filter(
        v => v === false
    ).length;

    assert(
        "S8 typing indicator cleared on error path",
        typingHistory >= 1 &&
        calls.typing[calls.typing.length - 1] === false
    );

    assert(
        "S8 no empty assistant persists after error",
        findChat(store, c.id).messages.every(m => m.content !== "")
    );

}


/* ===========================================================
   RUN ALL SCENARIOS
=========================================================== */

await scenarioSuccess();

await scenarioFailure();

await scenarioDoubleSend();

await scenarioChatSwitch();

await scenarioReload();

await scenarioSoundDisabled();

await scenarioSoundEnabled();

await scenarioErrorClearsTyping();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}