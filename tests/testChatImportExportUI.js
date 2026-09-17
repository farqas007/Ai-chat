/* ===========================================================
   B4 — Chat import/export UI wiring.

   The B4 audit found js/chat.js already implements (and tests)
   importChat()/exportChat(), but there was no UI entry point and
   nothing consumed the "chat:imported" event it emits. This file
   locks down the wiring added for B4:

     - a "chat:imported" Sidebar listener adds the chat to sidebar
       state and re-renders (mirroring chat:created)
     - the "chat:import-file" app handler runs the REAL Chat
       importChat() and then opens the imported chat
     - an invalid file leaves existing chats untouched and surfaces
       an error through the existing error mechanism
     - the "chat:export" app handler builds an application/json Blob
       and downloads it as chat-<id>.json, then revokes the URL

   Browser APIs (document, Blob, URL.createObjectURL/revokeObjectURL,
   anchor.click) are stubbed. No real browser, no network, no files.
   =========================================================== */

import assert from "node:assert";

import { App } from "../js/app.js";
import { Sidebar } from "../js/sidebar.js";
import Events from "../js/events.js";


globalThis.window = globalThis;

globalThis.speechSynthesis = {
    getVoices: () => [],
    cancel: () => {},
    speak: () => {},
    pause: () => {},
    resume: () => {},
    onvoiceschanged: null
};

const storageMap = new Map();

globalThis.localStorage = {
    getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: k => storageMap.delete(k),
    clear: () => storageMap.clear()
};


/* -----------------------------------------------------------
   DOM mock
----------------------------------------------------------- */

const anchors = [];

function makeEl(tag = "div") {
    return {
        tagName: tag,
        children: [],
        className: "",
        innerHTML: "",
        textContent: "",
        value: "",
        style: {},
        dataset: {},
        classList: {
            add() {}, remove() {}, toggle() {}, contains: () => false
        },
        appendChild(child) { this.children.push(child); return child; },
        addEventListener() {},
        setAttribute() {},
        click() {},
        remove() {},
        focus() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
}

const domMap = new Map();

globalThis.document = {
    querySelector: selector => domMap.get(selector) || null,
    querySelectorAll: () => [],
    createElement: tag => {
        const el = makeEl(tag);
        if (tag === "a") {
            anchors.push(el);
        }
        return el;
    },
    addEventListener() {},
    body: {
        appendChild() {},
        style: {},
        classList: { add() {}, remove() {} }
    }
};


/* -----------------------------------------------------------
   Blob / URL mock
----------------------------------------------------------- */

const blobs = [];
const revoked = [];

globalThis.Blob = class {
    constructor(parts, options = {}) {
        this.parts = parts;
        this.type = options.type;
    }
};

globalThis.URL = {
    createObjectURL: blob => {
        blobs.push(blob);
        return "blob:mock-url";
    },
    revokeObjectURL: url => {
        revoked.push(url);
    }
};


let passed = 0;
let failed = 0;

function check(name, condition) {
    if (condition) {
        passed += 1;
        console.log(`PASS: ${name}`);
    } else {
        failed += 1;
        console.log(`FAIL: ${name}`);
    }
}


/* -----------------------------------------------------------
   Fake UI + storage for the app harness
----------------------------------------------------------- */

const uiCalls = { errors: [], rendered: [] };

const fakeUi = {
    elements: {},
    markdown: { render: t => t },
    showError: message => uiCalls.errors.push(message),
    hideError() {},
    showTyping() {},
    renderChat: messages => uiCalls.rendered.push(messages),
    appendMessage() {},
    updateStreamingMessage() {},
    removeMessage() {},
    clearMessages() {},
    showEmptyState() {},
    setSending() {},
    setVoiceInputSupported() {},
    setVoiceInputListening() {},
    insertVoiceText() {},
    showGeneratedImage() {}
};


/* -----------------------------------------------------------
   ONE app harness for the whole file (the global EventBus would
   cross-talk if we built multiple).
----------------------------------------------------------- */

function createHarness() {
    const app = new App();

    app.ui = fakeUi;

    const storage = {
        lastCurrent: null,
        getChats: () => [],
        saveChats: () => true,
        setCurrentChat(id) { storage.lastCurrent = id; },
        getCurrentChat: () => null
    };

    app.chat.connect({ storage, ui: fakeUi });

    app.chat.state.chats = [
        { id: "chat_existing", title: "Existing", messages: [] }
    ];
    app.chat.state.currentChatId = "chat_existing";
    app.chat.state.messages = app.chat.state.chats[0].messages;

    app.sidebar = { state: { open: true }, connect() {}, initialize() {} };

    app.voiceInput = { isListening: false, start() {}, stop() {} };

    app.registerEvents();

    return { app, storage };
}

const harness = createHarness();
const app = harness.app;

function resetChat() {
    app.chat.state.chats = [
        { id: "chat_existing", title: "Existing", messages: [] }
    ];
    app.chat.state.currentChatId = "chat_existing";
    app.chat.state.messages = app.chat.state.chats[0].messages;

    uiCalls.errors.length = 0;
    uiCalls.rendered.length = 0;
    blobs.length = 0;
    revoked.length = 0;
    anchors.length = 0;
}


/* -----------------------------------------------------------
   a. chat:imported updates sidebar state and renders
----------------------------------------------------------- */

function testSidebarImported() {
    const chatListEl = makeEl("div");

    domMap.set("#conversationList", chatListEl);

    try {
        const sidebar = new Sidebar();

        sidebar.connect({ getChats: () => [] });

        sidebar.initialize();

        let renders = 0;

        const original = sidebar.render.bind(sidebar);

        sidebar.render = (...args) => {
            renders += 1;
            return original(...args);
        };

        const imported = {
            id: "chat_imported_sidebar",
            title: "Imported",
            messages: [],
            updatedAt: new Date().toISOString()
        };

        Events.emit("chat:imported", imported);

        assert.ok(
            sidebar.state.chats.includes(imported),
            "imported chat added to sidebar state"
        );
        assert.ok(
            renders >= 1,
            "sidebar re-rendered after chat:imported"
        );

        check("B4 chat:imported updates sidebar state and re-renders", true);
    } finally {
        domMap.delete("#conversationList");
    }
}


/* -----------------------------------------------------------
   b. Import handler imports JSON and opens the imported chat
----------------------------------------------------------- */

function testImportHandler() {
    resetChat();

    const json = JSON.stringify({
        id: "chat_imported",
        title: "Imported",
        messages: [
            { id: "im1", role: "user", content: "hello" }
        ]
    });

    Events.emit("chat:import-file", json);

    const imported = app.chat.state.chats.find(
        chat => chat.id === "chat_imported"
    );

    assert.ok(imported, "imported chat appended to chat state");
    assert.strictEqual(
        app.chat.state.currentChatId,
        "chat_imported",
        "imported chat is opened after import"
    );
    assert.strictEqual(
        app.chat.storage.lastCurrent,
        "chat_imported",
        "current chat persisted"
    );
    assert.ok(
        uiCalls.rendered.length >= 1,
        "openChat rendered the imported chat messages"
    );

    check("B4 chat:import-file imports JSON and opens the imported chat", true);
}


/* -----------------------------------------------------------
   c. Invalid JSON does not corrupt chats and surfaces an error
----------------------------------------------------------- */

function testInvalidImport() {
    resetChat();

    const before = app.chat.state.chats.length;

    assert.doesNotThrow(
        () => Events.emit("chat:import-file", "{not json"),
        "invalid JSON never throws"
    );

    assert.strictEqual(
        app.chat.state.chats.length,
        before,
        "invalid JSON leaves existing chats untouched"
    );
    assert.strictEqual(
        app.chat.state.currentChatId,
        "chat_existing",
        "invalid JSON does not switch the current chat"
    );
    assert.ok(
        uiCalls.errors.length >= 1,
        "invalid JSON surfaces an error through the existing mechanism"
    );

    check("B4 invalid import leaves chats intact and surfaces an error", true);
}


/* -----------------------------------------------------------
   d. Export handler downloads chat-<id>.json
----------------------------------------------------------- */

function testExportHandler() {
    resetChat();

    app.chat.state.chats = [
        {
            id: "chat_1",
            title: "Exportable",
            messages: [{ id: "m1", role: "user", content: "hi" }],
            updatedAt: new Date().toISOString()
        }
    ];
    app.chat.state.currentChatId = "chat_1";
    app.chat.state.messages = app.chat.state.chats[0].messages;

    Events.emit("chat:export");

    assert.strictEqual(anchors.length, 1, "export triggers exactly one download");
    assert.strictEqual(
        anchors[0].download,
        "chat-chat_1.json",
        "download filename is chat-<id>.json"
    );
    assert.strictEqual(blobs.length, 1, "one Blob created for the export");
    assert.strictEqual(blobs[0].type, "application/json", "export Blob is JSON");
    assert.strictEqual(
        JSON.parse(blobs[0].parts[0]).id,
        "chat_1",
        "Blob contains the exported chat JSON"
    );
    assert.ok(
        revoked.includes("blob:mock-url"),
        "object URL is revoked after the download"
    );

    check("B4 chat:export downloads chat-<id>.json and revokes the URL", true);
}


/* -----------------------------------------------------------
   d2. Export with no chat surfaces an error and downloads nothing
----------------------------------------------------------- */

function testExportNoChat() {
    resetChat();

    app.chat.state.chats = [];
    app.chat.state.currentChatId = null;
    app.chat.state.messages = [];

    Events.emit("chat:export");

    assert.strictEqual(blobs.length, 0, "no Blob without a chat");
    assert.strictEqual(anchors.length, 0, "no download without a chat");
    assert.ok(
        uiCalls.errors.length >= 1,
        "no-chat export surfaces an error"
    );

    check("B4 chat:export without a chat surfaces an error", true);
}


testSidebarImported();
testImportHandler();
testInvalidImport();
testExportHandler();
testExportNoChat();


console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
