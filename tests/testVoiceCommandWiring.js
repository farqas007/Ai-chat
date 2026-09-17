/* ===========================================================
   Regression tests for B1/B2 — voice command event wiring.

   B1: the "clear chat" voice command emits "chat:clear", which
       must clear the active chat via Chat.clearChat() and still
       emit the existing "chat:cleared" event exactly once.
   B2: the "settings" voice command emits "voice:settings", which
       must open the VoiceUI via VoiceUI.show() without breaking
       the existing voice:toggle show/hide behavior.
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
        dataset: {},
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

    const ui = {
        showTyping: () => {},
        showError: () => {},
        hideError: () => {},
        setSending: () => {},
        removeMessage: () => {},
        updateStreamingMessage: () => {},
        renderChat: () => {},
        appendMessage() {}, updateMessage() {}, clearMessages() {},
        showEmptyState() {}, setTitle() {}, scrollToBottom() {},
        setUnreadBadge() {}, setVoiceInputSupported() {},
        presentVoiceSettings() {},
        markdown: { render: t => t }
    };

    const app = new App();

    const chat = new Chat();

    chat.connect({ storage, ui });

    app.chat = chat;
    app.ui = ui;
    app.markdown = { render: t => t };

    app.registerEvents();

    return { app, chat, storage, store, ui };

}


/* -----------------------------------------------------------
   B1 — "chat:clear" clears the active chat and emits
   "chat:cleared" exactly once.
----------------------------------------------------------- */

function testChatClearWired() {

    Events.clear();

    const h = createHarness();

    const { chat, store } = h;

    const a = chat.createChat("Clear Me");

    const chatObj = chat.state.chats.find(c => c.id === a.id);

    chatObj.messages.push({ role: "user", content: "hello" });

    chat.state.messages = [{ role: "user", content: "hello" }];

    const cleared = [];

    Events.on("chat:cleared", id => cleared.push(id));

    Events.emit("chat:clear");

    assert(
        "B1 chat:clear clears the active chat messages",
        chatObj.messages.length === 0
    );

    assert(
        "B1 chat:clear clears the in-memory current messages",
        chat.state.messages.length === 0
    );

    assert(
        "B1 chat:cleared emitted once with the chat id",
        cleared.length === 1 && cleared[0] === a.id
    );

    assert(
        "B1 cleared chat persisted",
        store.chats.find(c => c.id === a.id).messages.length === 0
    );

}


/* -----------------------------------------------------------
   B1 (safety) — "chat:clear" with no active chat is a no-op
   and must not throw or emit chat:cleared.
----------------------------------------------------------- */

function testChatClearNoActiveChat() {

    Events.clear();

    const h = createHarness();

    const { chat } = h;

    chat.state.chats = [];

    chat.state.currentChatId = null;

    let clearedFired = false;

    Events.on("chat:cleared", () => { clearedFired = true; });

    let threw = false;

    try {

        Events.emit("chat:clear");

    } catch (error) {

        threw = true;

    }

    assert(
        "B1 chat:clear with no active chat does not throw",
        !threw
    );

    assert(
        "B1 chat:clear with no active chat emits no chat:cleared",
        !clearedFired
    );

}


/* -----------------------------------------------------------
   B2 — "voice:settings" opens the VoiceUI via show().
----------------------------------------------------------- */

function testVoiceSettingsWired() {

    Events.clear();

    const h = createHarness();

    const { app } = h;

    let shows = 0;
    let hides = 0;

    app.voiceUI = {
        modal: { style: { display: "none" } },
        show: () => { shows++; },
        hide: () => { hides++; }
    };

    Events.emit("voice:settings");

    assert(
        "B2 voice:settings calls VoiceUI.show() once",
        shows === 1
    );

    assert(
        "B2 voice:settings does not hide",
        hides === 0
    );

    /* Existing voice:toggle behavior must remain intact. */

    Events.emit("voice:toggle");

    assert(
        "B2 voice:toggle still opens the modal while hidden",
        shows === 2 && hides === 0
    );

    app.voiceUI.modal.style.display = "flex";

    Events.emit("voice:toggle");

    assert(
        "B2 voice:toggle still closes the modal while open",
        shows === 2 && hides === 1
    );

}


/* -----------------------------------------------------------
   B2 (safety) — "voice:settings" without a VoiceUI is a no-op.
----------------------------------------------------------- */

function testVoiceSettingsNoVoiceUI() {

    Events.clear();

    const h = createHarness();

    h.app.voiceUI = null;

    let threw = false;

    try {

        Events.emit("voice:settings");

    } catch (error) {

        threw = true;

    }

    assert(
        "B2 voice:settings without VoiceUI does not throw",
        !threw
    );

}


testChatClearWired();

testChatClearNoActiveChat();

testVoiceSettingsWired();

testVoiceSettingsNoVoiceUI();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}