/* ===========================================================
   F7 — Chat class action-method coverage.

   The F7 audit found the Chat class exposes several action
   methods that are implemented but currently DORMANT (no UI
   element, no event listener, no caller):

     - clearChat()      -> emits "chat:cleared"
     - regenerate()     -> emits "ai:regenerate"
     - importChat()     -> emits "chat:imported"
     - exportChat()     -> returns JSON (no event)
     - deleteMessage()  -> emits "message:deleted"  (same handling
                           path as rollbackEmptyMessage)

   These methods are part of the live Chat class API and are
   deterministic, so this file locks down their current contract
   so any future wiring (or refactor) cannot silently change it:

   - clearChat clears current messages, persists, updates UI and
     emits the chat id
   - regenerate re-emits the preceding message for the current
     chat (and is a safe no-op when there is no predecessor)
   - importChat validates a chat payload (object or JSON string),
     requires an id, pushes + persists + emits, and reports errors
     through handleError without mutating state
   - exportChat returns pretty JSON (or null)
   - deleteMessage removes one message, persists, updates UI and
     emits the message id

   No UI is wired here; this only drives the Chat class directly
   with the same harness pattern as testChatStorage.js.
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


import assert from "node:assert";

import Events from "../js/events.js";
import { Chat } from "../js/chat.js";


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


function makeChat() {

    const savedChats = [];
    const calls = { saveCount: 0, uiCleared: 0, uiMessageRemoved: [] };

    const storage = {
        getChats: () => [],
        saveChats: chats => {
            calls.saveCount += 1;
            savedChats.push(chats);
            return true;
        },
        setCurrentChat: () => {},
        getCurrentChat: () => null
    };

    const ui = {
        clearMessages: () => { calls.uiCleared += 1; },
        removeMessage: id => calls.uiMessageRemoved.push(id),
        showError: () => {}
    };

    const chat = new Chat();

    chat.connect({ storage, ui });

    chat.state.chats = [
        {
            id: "chat_1",
            title: "New Chat",
            messages: [
                { id: "m1", role: "user", content: "hello" },
                { id: "m2", role: "assistant", content: "hi" },
                { id: "m3", role: "user", content: "again" }
            ]
        },
        { id: "chat_2", title: "Other", messages: [] }
    ];

    chat.state.currentChatId = "chat_1";

    chat.state.messages = chat.state.chats[0].messages;

    return { chat, calls, savedChats };
}


/* Cap an event channel during one assertion, then release it. */

function captureEvent(name) {
    const captured = [];
    const listener = payload => captured.push(payload);
    Events.on(name, listener);
    return {
        values: captured,
        release: () => Events.off(name, listener)
    };
}


/* -----------------------------------------------------------
   clearChat
----------------------------------------------------------- */

function testClearChat() {
    const { chat, calls } = makeChat();

    const cleared = captureEvent("chat:cleared");

    chat.clearChat();

    assert.deepStrictEqual(chat.state.chats[0].messages, [], "current chat messages cleared");
    assert.deepStrictEqual(chat.state.messages, [], "state.messages cleared");
    assert.strictEqual(calls.saveCount, 1, "clearChat persists once");
    assert.strictEqual(calls.uiCleared, 1, "clearChat clears the UI");

    assert.strictEqual(cleared.values.length, 1, "chat:cleared emitted once");
    assert.strictEqual(cleared.values[0], "chat_1", "chat:cleared payload is the chat id");

    cleared.release();

    check("C clearChat clears messages, persists, clears UI, emits chat:cleared", true);

    // No current chat -> safe no-op.
    chat.state.currentChatId = null;

    const before = calls.saveCount;

    assert.doesNotThrow(() => chat.clearChat(), "clearChat with no chat never throws");
    assert.strictEqual(calls.saveCount, before, "clearChat no-ops without a current chat");

    check("C clearChat is a safe no-op without a current chat", true);
}


/* -----------------------------------------------------------
   regenerate
----------------------------------------------------------- */

function testRegenerate() {
    const { chat } = makeChat();

    const captured = captureEvent("ai:regenerate");

    // Identify the assistant message m2; predecessor is the user m1.
    chat.regenerate("m2");

    assert.strictEqual(captured.values.length, 1, "ai:regenerate emitted once");
    assert.strictEqual(captured.values[0].message, "hello", "payload carries the preceding user message");
    assert.strictEqual(captured.values[0].chatId, "chat_1", "payload carries the chat id");

    captured.release();

    check("C regenerate emits the preceding user message for the chat", true);

    // First message has no predecessor -> no emission.
    const cap2 = captureEvent("ai:regenerate");

    chat.regenerate("m1");

    assert.strictEqual(cap2.values.length, 0, "first message never regenerates");

    cap2.release();

    check("C regenerate no-ops for the first message (no predecessor)", true);

    // Unknown id -> no emission.
    const cap3 = captureEvent("ai:regenerate");

    chat.regenerate("nope");

    assert.strictEqual(cap3.values.length, 0, "unknown message id never regenerates");
    assert.doesNotThrow(() => chat.regenerate("nope"), "regenerate with unknown id never throws");

    cap3.release();

    check("C regenerate no-ops for unknown messages", true);

    // No current chat -> no emission.
    chat.state.currentChatId = null;

    const cap4 = captureEvent("ai:regenerate");

    chat.regenerate("m2");

    assert.strictEqual(cap4.values.length, 0, "no current chat -> nothing emitted");

    cap4.release();

    check("C regenerate is a safe no-op without a current chat", true);
}


/* -----------------------------------------------------------
   exportChat
----------------------------------------------------------- */

function testExportChat() {
    const { chat } = makeChat();

    const exported = chat.exportChat("chat_1");

    assert.strictEqual(typeof exported, "string", "exportChat returns a string");
    assert.strictEqual(JSON.parse(exported).id, "chat_1", "export round-trips the chat");
    assert.ok(exported.includes("\n  "), "export is pretty-printed with indentation");

    check("C exportChat(chatId) returns pretty JSON", true);

    const current = chat.exportChat();

    assert.strictEqual(JSON.parse(current).id, "chat_1", "exportChat() defaults to the current chat");

    check("C exportChat() defaults to the current chat", true);

    chat.state.currentChatId = null;

    assert.strictEqual(chat.exportChat(), null, "exportChat returns null without a chat");
    assert.strictEqual(chat.exportChat("missing_id"), null, "exportChat returns null for an unknown id");

    check("C exportChat returns null when no chat matches", true);
}


/* -----------------------------------------------------------
   importChat
----------------------------------------------------------- */

function testImportChat() {
    const { chat, calls } = makeChat();

    const imported = captureEvent("chat:imported");

    const payload = {
        id: "chat_imported",
        title: "Imported",
        messages: [{ id: "im1", role: "user", content: "x" }]
    };

    const result = chat.importChat(payload);

    assert.strictEqual(result, payload, "importChat returns the imported chat object");
    assert.deepStrictEqual(chat.state.chats[2], payload, "imported chat appended to state");
    assert.strictEqual(calls.saveCount, 1, "importChat persists");

    assert.strictEqual(imported.values.length, 1, "chat:imported emitted once");
    assert.strictEqual(imported.values[0].id, "chat_imported", "imported event carries the chat");

    imported.release();

    check("C importChat accepts an object, appends, persists, emits chat:imported", true);

    // JSON string form.
    const json = JSON.stringify({ id: "chat_str", title: "Str", messages: [] });

    const result2 = chat.importChat(json);

    assert.strictEqual(result2.id, "chat_str", "importChat parses JSON strings");
    assert.strictEqual(chat.state.chats.length, 4, "string-form chat appended too");

    check("C importChat accepts a JSON string payload", true);

    // Missing id -> reported via handleError, state untouched.
    const before = chat.state.chats.length;

    const invalid = chat.importChat({ title: "No id here" });

    assert.strictEqual(invalid, null, "invalid chat returns null");
    assert.strictEqual(chat.state.chats.length, before, "invalid chat is not appended");

    check("C importChat rejects payloads without an id", true);

    // Invalid JSON -> reported, state untouched, no crash.
    const before2 = chat.state.chats.length;

    const bad = chat.importChat("{not json");

    assert.strictEqual(bad, null, "invalid JSON returns null");
    assert.strictEqual(chat.state.chats.length, before2, "invalid JSON not appended");

    check("C importChat rejects malformed JSON safely", true);
}


/* -----------------------------------------------------------
   deleteMessage
----------------------------------------------------------- */

function testDeleteMessage() {
    const { chat, calls } = makeChat();

    const removed = captureEvent("message:deleted");

    chat.deleteMessage("m2");

    assert.deepStrictEqual(
        chat.state.chats[0].messages.map(m => m.id),
        ["m1", "m3"],
        "target message removed from the chat"
    );
    assert.deepStrictEqual(
        chat.state.messages.map(m => m.id),
        ["m1", "m3"],
        "state.messages updated for the current chat"
    );
    assert.ok(calls.uiMessageRemoved.includes("m2"), "ui.removeMessage called with the id");
    assert.strictEqual(calls.saveCount, 1, "deleteMessage persists");

    assert.strictEqual(removed.values.length, 1, "message:deleted emitted once");
    assert.strictEqual(removed.values[0], "m2", "message:deleted payload is the message id");

    removed.release();

    check("C deleteMessage removes a message, persists, updates UI, emits message:deleted", true);

    // No current chat -> safe no-op.
    chat.state.currentChatId = null;

    assert.doesNotThrow(() => chat.deleteMessage("m1"), "deleteMessage with no chat never throws");

    check("C deleteMessage is a safe no-op without a current chat", true);
}


testClearChat();
testRegenerate();
testExportChat();
testImportChat();
testDeleteMessage();

// All event channels used above must be fully drained so the global
// bus is left exactly as this file found it.
assert.strictEqual(Events.listenerCount("chat:cleared"), 0);
assert.strictEqual(Events.listenerCount("ai:regenerate"), 0);
assert.strictEqual(Events.listenerCount("chat:imported"), 0);
assert.strictEqual(Events.listenerCount("message:deleted"), 0);

check("C no listeners leaked onto the global event bus", true);


console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}