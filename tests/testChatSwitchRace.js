/* ===========================================================
   Regression test for the async chat-switch SUCCESS race.

   A request started in Chat A must be written back to Chat A
   even if the user switches to Chat B before the response lands.
   The currently-active chat must never be used as the destination
   of an already-started request.
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
    app.api = { streamMessage: async (_m, _h, c) => { c.onDone("<p>ok</p>"); return "<p>ok</p>"; } };

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


/* ===========================================================
   TEST A — Success after switching to another chat
=========================================================== */

async function testSuccessAfterSwitch() {

    h.resetCalls();

    const a = chat.createChat("Chat A");

    let resolveRequest = null;

    app.api.streamMessage = (_m, _h, c) => new Promise(resolve => {
        resolveRequest = () => { c.onDone("<p>Hello from A</p>"); resolve("<p>Hello from A</p>"); };
    });

    Events.emit("chat:send", "message in A");

    assert(
        "TA request started in chat A (user + empty assistant placeholder)",
        findChat(store, a.id).messages.length === 2 &&
        chat.state.currentChatId === a.id
    );

    // Switch to chat B while A's request is still pending.
    const b = chat.createChat("Chat B");

    assert(
        "TA chat B is now active",
        chat.state.currentChatId === b.id
    );

    resolveRequest();

    await settle();

    const aMessages = findChat(store, a.id).messages;
    const bMessages = findChat(store, b.id).messages;

    assert(
        "TA chat A receives the assistant response",
        aMessages.length === 2 &&
        aMessages[1].role === "assistant" &&
        aMessages[1].content === "<p>Hello from A</p>"
    );

    assert(
        "TA chat B receives nothing from A's request",
        bMessages.length === 0
    );

    assert(
        "TA response not rendered into the active chat B",
        calls.streamUpdated.length === 0
    );

    assert(
        "TA send lock released after resolution",
        app.state.sending === false &&
        calls.sending[calls.sending.length - 1] === false
    );

    assert(
        "TA typing indicator hidden after resolution",
        calls.typing[calls.typing.length - 1] === false
    );

    // Switch back to chat A — the stored response must now render.
    chat.openChat(a.id);

    const lastRendered = calls.rendered[calls.rendered.length - 1] || [];

    assert(
        "TA switching back to A shows the assistant response",
        lastRendered.some(m =>
            m.role === "assistant" && m.content === "<p>Hello from A</p>"
        )
    );

}


/* ===========================================================
   TEST B — Normal same-chat success (no switch)
=========================================================== */

async function testSameChatSuccess() {

    h.resetCalls();

    const a = chat.createChat("Same Chat A");

    app.api.streamMessage = async (_m, _h, c) => { c.onDone("<p>Same-chat reply</p>"); return "<p>Same-chat reply</p>"; };

    Events.emit("chat:send", "normal message");

    await settle();

    const messages = findChat(store, a.id).messages;

    assert(
        "TB same-chat response appears in chat A",
        messages.length === 2 &&
        messages[1].role === "assistant" &&
        messages[1].content === "<p>Same-chat reply</p>"
    );

    assert(
        "TB response rendered into the active chat",
        calls.streamUpdated.some(([id, html]) => html === "<p>Same-chat reply</p>")
    );

    assert(
        "TB typing shown then hidden",
        calls.typing.includes(true) && calls.typing[calls.typing.length - 1] === false
    );

    assert(
        "TB send lock released",
        app.state.sending === false &&
        calls.sending[calls.sending.length - 1] === false
    );

    assert(
        "TB no empty assistant left behind",
        messages.every(m => m.content !== "")
    );

}


/* ===========================================================
   TEST C — Failure after switching to another chat
=========================================================== */

async function testFailureAfterSwitch() {

    h.resetCalls();

    const a = chat.createChat("Fail Chat A");

    let rejectRequest = null;

    app.api.streamMessage = (_m, _h, c) => new Promise((resolve, reject) => {
        rejectRequest = () => { const e = new Error("A message failed"); c.onError(e); reject(e); };
    });

    Events.emit("chat:send", "fail me");

    const b = chat.createChat("Fail Chat B");

    rejectRequest();

    await settle();

    const aMessages = findChat(store, a.id).messages;
    const bMessages = findChat(store, b.id).messages;

    assert(
        "TC chat A keeps its user message",
        aMessages.length === 1 &&
        aMessages[0].role === "user" &&
        aMessages[0].content === "fail me"
    );

    assert(
        "TC chat A empty assistant placeholder rolled back",
        aMessages.every(m => m.content !== "")
    );

    assert(
        "TC chat B untouched by A's failure",
        bMessages.length === 0
    );

    assert(
        "TC error surfaced",
        calls.errors.includes("A message failed")
    );

    assert(
        "TC typing indicator hidden after failure",
        calls.typing[calls.typing.length - 1] === false
    );

    assert(
        "TC send lock released after failure",
        app.state.sending === false &&
        calls.sending[calls.sending.length - 1] === false
    );

}


/* ===========================================================
   RUN ALL TESTS
=========================================================== */

await testSuccessAfterSwitch();

await testSameChatSuccess();

await testFailureAfterSwitch();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}