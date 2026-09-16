/* ===========================================================
   Regression tests for F3 — Chat UI bug fixes.

   F3-A: chat:selected carries a string chat id (Sidebar) and, as
         an internal re-emission of the just-opened chat, a full
         chat object (Chat.openChat). The app handler must handle
         the string form (including re-rendering the current chat)
         and defensively ignore object/invalid payloads.
   F3-B: the sidebar search input was queried but missing from
         index.html. The markup now exists so the existing search
         logic is live; Sidebar.search() itself must still be a
         safe no-op when the element is absent.
   F3-C: while a send is in flight, a new submit must not lose the
         user's typed text. sendInput() keeps the composer content
         and refocuses it on every suppression path; the existing
         duplicate-submit and single-send protection stays intact.

   In-memory storage / fake DOM only. No real API/provider calls.
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


import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { App } from "../js/app.js";
import { Chat } from "../js/chat.js";
import { Sidebar } from "../js/sidebar.js";
import { UI } from "../js/ui.js";
import Events from "../js/events.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.join(__dirname, "..");


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

    const calls = { rendered: [] };

    const ui = {
        elements: { imageButton: { disabled: false } },
        showTyping() {}, showError() {}, hideError() {},
        setSending() {}, removeMessage() {}, updateStreamingMessage() {},
        renderChat: messages => calls.rendered.push(messages.map(m => ({ ...m }))),
        appendMessage() {}, updateMessage() {}, clearMessages() {},
        showEmptyState() {}, setTitle() {}, scrollToBottom() {},
        setUnreadBadge() {}, setVoiceInputSupported() {},
        setVoiceInputListening() {}, insertVoiceText() {},
        showGeneratedImage() {},
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
        speak() {}, stopSpeaking() {},
        detector: { detect: () => ({}) },
        player: { pause() {}, resume() {} },
        config: { paused: false }, settings: { language: "en-US" }
    };
    app.voiceInput = { isListening: false, start() {}, stop() {} };
    app.api = { streamMessage: async () => {} };

    app.registerEvents();

    return { app, chat, storage, store, calls, ui };

}


function userMessages(store, id) {
    const chat = store.chats.find(c => c.id === id);
    return (chat && chat.messages) ? chat.messages.filter(m => m.role === "user") : [];
}


// ONE shared app harness: listeners registered by app.registerEvents
// accumulate on the global EventBus, so multiple harnesses would
// cross-talk. Each test resets the state it needs.
const h = createHarness();


/* -----------------------------------------------------------
   F3-A — chat:selected: Sidebar emits a string id; Chat.openChat
   re-emits a chat OBJECT for the chat it just opened (already the
   current chat). The app handler must handle the string form
   (including re-rendering the current chat when re-clicked, which
   the restore/refresh flow relies on) and treat object payloads
   as already-handled internal re-emissions.
----------------------------------------------------------- */

function testChatSelectedHandlesStringAndObjectForms() {

    const a = h.chat.createChat("Chat A");

    const b = h.chat.createChat("Chat B");

    assert(
        "F3-A harness: chat B is current after create",
        h.chat.state.currentChatId === b.id
    );

    // String form (what Sidebar emits on a click).
    Events.emit("chat:selected", a.id);

    assert(
        "F3-A string chat ID opens the chat",
        h.chat.state.currentChatId === a.id
    );

    // Re-selecting the already-current chat by string must still
    // re-render it (pre-existing restore/refresh behavior).
    let before = h.calls.rendered.length;

    Events.emit("chat:selected", a.id);

    assert(
        "F3-A re-selecting current chat renders again",
        h.chat.state.currentChatId === a.id &&
        h.calls.rendered.length === before + 1
    );

    // Object form is Chat.openChat's internal re-emission of the
    // chat it just opened; it must be ignored (no loop, no re-open).
    let before2 = h.calls.rendered.length;

    Events.emit("chat:selected", { id: a.id, title: "Chat A" });

    assert(
        "F3-A object payload ignored (already-current internal emit)",
        h.chat.state.currentChatId === a.id &&
        h.calls.rendered.length === before2
    );

    // Invalid payloads are ignored.
    Events.emit("chat:selected", null);

    assert(
        "F3-A null payload ignored",
        h.chat.state.currentChatId === a.id
    );

    let before3 = h.calls.rendered.length;

    Events.emit("chat:selected", { title: "no id" });

    assert(
        "F3-A object without id ignored",
        h.chat.state.currentChatId === a.id &&
        h.calls.rendered.length === before3
    );

    // A different string ID still opens.
    Events.emit("chat:selected", b.id);

    assert(
        "F3-A switching to another chat via string still works",
        h.chat.state.currentChatId === b.id
    );

}


/* -----------------------------------------------------------
   F3-B — search input now exists in index.html; Sidebar.search
   filters safely, and a missing element is a safe no-op.
----------------------------------------------------------- */

function testChatSearchMarkupAndLogic() {

    const indexHtml = fs.readFileSync(
        path.join(repoRoot, "index.html"),
        "utf8"
    );

    assert(
        "F3-B index.html contains the #searchChats input",
        indexHtml.includes('id="searchChats"')
    );

    // Missing element -> safe no-op (no crash, no dead query).
    const sidebar = new Sidebar();

    assert(
        "F3-B missing search element resolves to null",
        sidebar.elements.searchInput === null
    );

    sidebar.state.chats = [
        { id: "c1", title: "Notes x", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "c2", title: "Other", updatedAt: "2026-01-02T00:00:00.000Z" }
    ];

    const rendered = [];

    sidebar.render = chats => rendered.push(chats);

    sidebar.search("notes x");

    assert(
        "F3-B search filters chats without a DOM element",
        rendered.length === 1 &&
        rendered[0].length === 1 &&
        rendered[0][0].title === "Notes x"
    );

    sidebar.search("  ");

    assert(
        "F3-B empty query resets to the full list",
        rendered.length === 2 &&
        rendered[1].length === 2
    );

    // Element present -> the input listener wires search live.
    const savedQuerySelector = globalThis.document.querySelector;

    let searchEl = null;

    globalThis.document.querySelector = sel =>
        sel === "#searchChats" ? searchEl : savedQuerySelector(sel);

    const handlers = {};

    searchEl = {
        value: "",
        addEventListener: (event, fn) => { handlers[event] = fn; }
    };

    const liveSidebar = new Sidebar();

    liveSidebar.initialize();

    let capturedQuery = null;

    liveSidebar.search = q => { capturedQuery = q; };

    handlers["input"] && handlers["input"]({ target: { value: "album" } });

    assert(
        "F3-B search input listener calls search() with the query",
        capturedQuery === "album"
    );

    globalThis.document.querySelector = savedQuerySelector;

}


/* -----------------------------------------------------------
   F3-C — while a send is in flight, user text is never lost and
   duplicate-submit protection stays intact.
----------------------------------------------------------- */

async function testNoSilentSendLossWhileSending() {

    // Reset the shared harness to a clean send state.
    h.app.state.sending = false;
    h.app._lastSendText = null;
    h.app._lastSendChatId = null;
    h.app._lastSendAt = null;
    h.apiCalls = 0;

    let holdRequest = null;

    h.app.api.streamMessage = (message, history, callbacks) => {
        h.apiCalls++;
        return new Promise(resolve => {
            holdRequest = () => {
                callbacks.onDone("<p>ok</p>");
                resolve("<p>ok</p>");
            };
        });
    };

    const c = h.chat.createChat("Send Chat");

    Events.emit("chat:send", "first");

    assert(
        "F3-C send lock held while request in flight",
        h.app.state.sending === true
    );

    assert(
        "F3-C exactly one API call",
        h.apiCalls === 1
    );

    // App-level: a second send while sending is suppressed.
    const suppressed = Events.emit("chat:send", "second");

    assert(
        "F3-C duplicate send suppressed (not accepted)",
        suppressed !== true
    );

    assert(
        "F3-C suppressed text not stored as a message",
        userMessages(h.store, c.id).every(m => m.content !== "second") &&
        userMessages(h.store, c.id).length === 1
    );

    // UI-level path 1: send button disabled (send in flight).
    // The typed text must remain in the composer and be refocused.
    const focusCalls1 = [];

    const mockUi1 = {
        elements: {
            input: { value: "draft while sending", focus: () => focusCalls1.push(1) },
            sendButton: { disabled: true }
        }
    };

    UI.prototype.sendInput.call(mockUi1);

    assert(
        "F3-C disabled-button send keeps composer text",
        mockUi1.elements.input.value === "draft while sending"
    );

    assert(
        "F3-C disabled-button send refocuses the input",
        focusCalls1.length === 1
    );

    // UI-level path 2: button enabled but app guard active.
    const focusCalls2 = [];

    const mockUi2 = {
        elements: {
            input: { value: "draft2", focus: () => focusCalls2.push(1) },
            sendButton: { disabled: false }
        }
    };

    UI.prototype.sendInput.call(mockUi2);

    assert(
        "F3-C app-guard send keeps composer text",
        mockUi2.elements.input.value === "draft2"
    );

    assert(
        "F3-C app-guard send refocuses the input",
        focusCalls2.length === 1
    );

    assert(
        "F3-C app-guard suppressed text not stored",
        userMessages(h.store, c.id).every(m => m.content !== "draft2")
    );

    // Release the in-flight request; send lock frees.
    holdRequest();

    await settle();

    assert(
        "F3-C lock released after completion",
        h.app.state.sending === false
    );

    // A normal send works again afterwards.
    const accepted = Events.emit("chat:send", "after");

    await settle();

    assert(
        "F3-C a later send is accepted again",
        accepted === true
    );

    assert(
        "F3-C later send stored",
        userMessages(h.store, c.id).some(m => m.content === "after")
    );

}


testChatSelectedHandlesStringAndObjectForms();

testChatSearchMarkupAndLogic();

await testNoSilentSendLossWhileSending();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}