/* ===========================================================
   Regression tests for chat-sidebar data consistency + storage
   key canonicalization.

   F13: when a chat title is auto-updated after the first
        message (updateChatTitle() -> "chat:title-updated"), the
        Sidebar state is updated and re-rendered so the sidebar
        title stays in sync.
   F14: deleteChat() removes the chat from state AND clears the
        persisted "current chat" reference when the active chat
        is deleted (no stale id resurrected on reload).
   F15: every storage key comes from the single canonical
        STORAGE_KEYS source; VoiceSettings no longer writes
        under its own private key string.
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


import Events from "../js/events.js";
import { Chat } from "../js/chat.js";
import { Sidebar } from "../js/sidebar.js";
import { Storage, STORAGE_KEYS } from "../js/storage.js";
import { VoiceSettings } from "../js/voiceSettings.js";


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


/* -----------------------------------------------------------
   F13 — Sidebar follows auto-updated chat titles.
----------------------------------------------------------- */

function testTitleUpdatedSyncsSidebar() {

    const sidebar = new Sidebar();

    sidebar.connect({
        getChats: () => [{ id: "chat_1", title: "New Chat", updatedAt: "2026-01-01T00:00:00.000Z" }]
    });

    sidebar.initialize();

    Events.emit("chat:title-updated", {
        id: "chat_1",
        title: "First message body",
        updatedAt: "2026-01-02T00:00:00.000Z"
    });

    const chat = sidebar.state.chats.find(c => c.id === "chat_1");

    assert(
        "F13 sidebar chat title synced from chat:title-updated",
        chat && chat.title === "First message body"
    );

    assert(
        "F13 sidebar chat updatedAt synced",
        chat && chat.updatedAt === "2026-01-02T00:00:00.000Z"
    );

}


/* -----------------------------------------------------------
   F14 — deleteChat removes state + clears persisted current.
----------------------------------------------------------- */

function testDeleteActiveChatClearsPersistence() {

    const writes = [];

    const storage = {
        getChats: () => [],
        saveChats: () => true,
        setCurrentChat: id => writes.push(id)
    };

    const ui = { showEmptyState: () => {} };

    const chat = new Chat();

    chat.connect({ storage, ui });

    chat.state.chats = [
        { id: "chat_a", title: "A", messages: [] },
        { id: "chat_b", title: "B", messages: [] }
    ];

    chat.state.currentChatId = "chat_a";

    let deletedEmitted = false;

    Events.on("chat:deleted", id => {
        if (id === "chat_a") deletedEmitted = true;
    });

    chat.deleteChat("chat_a");

    assert(
        "F14 chat removed from state",
        chat.state.chats.length === 1 &&
        chat.state.chats[0].id === "chat_b"
    );

    assert(
        "F14 currentChatId cleared",
        chat.state.currentChatId === null
    );

    assert(
        "F14 persisted current chat cleared (null)",
        writes[writes.length - 1] === null
    );

    assert(
        "F14 chat:deleted emitted",
        deletedEmitted
    );

}


function testDeleteInactiveChatKeepsCurrentChat() {

    const writes = [];

    const storage = {
        getChats: () => [],
        saveChats: () => true,
        setCurrentChat: id => writes.push(id)
    };

    const chat = new Chat();

    chat.connect({ storage });

    chat.state.chats = [
        { id: "chat_a", title: "A", messages: [] },
        { id: "chat_b", title: "B", messages: [] }
    ];

    chat.state.currentChatId = "chat_a";

    chat.deleteChat("chat_b");

    assert(
        "F14 deleting a non-active chat keeps currentChatId",
        chat.state.currentChatId === "chat_a"
    );

    assert(
        "F14 no current-chat write on inactive delete",
        writes.length === 0
    );

}


/* -----------------------------------------------------------
   F13 (unit) — updateChatTitle() emits the sync event.
----------------------------------------------------------- */

function testUpdateChatTitleEmitsEvent() {

    let captured = null;

    Events.on("chat:title-updated", chat => {
        captured = chat;
    });

    const chat = new Chat();

    chat.state.currentChatId = "chat_9";

    chat.state.chats = [
        {
            id: "chat_9",
            title: "New Chat",
            messages: [{ role: "user", content: "How do I center a div?" }],
            updatedAt: "2026-01-01T00:00:00.000Z"
        }
    ];

    chat.updateChatTitle();

    assert(
        "F13 updateChatTitle emits chat:title-updated",
        captured && captured.id === "chat_9"
    );

    assert(
        "F13 emitted title truncated to 30 chars",
        captured && captured.title ===
            "How do I center a div?"
    );

    assert(
        "F13 title only updates once (New Chat -> derived)",
        chat.state.chats[0].title === "How do I center a div?"
    );

    chat.updateChatTitle();

    assert(
        "F13 second call does not change the derived title",
        captured.title === "How do I center a div?"
    );

}


/* -----------------------------------------------------------
   F15 — canonical storage keys everywhere.
----------------------------------------------------------- */

function testCanonicalStorageKeys() {

    assert(
        "F15 canonical keys expose all namespaces",
        STORAGE_KEYS.CHATS === "ai_chat_chats" &&
        STORAGE_KEYS.CURRENT_CHAT === "ai_chat_current_chat" &&
        STORAGE_KEYS.SETTINGS === "ai_chat_settings" &&
        STORAGE_KEYS.VOICE_SETTINGS === "voice-settings"
    );

    const settings = new VoiceSettings();

    settings.set({ rate: 0.9 });

    settings.save();

    assert(
        "F15 VoiceSettings writes under STORAGE_KEYS.VOICE_SETTINGS",
        localStorage.getItem(STORAGE_KEYS.VOICE_SETTINGS) !== null
    );

}


function testStorageUsesCanonicalKeys() {

    const storage = new Storage();

    storage.saveChats([{ id: "x", title: "X", messages: [], updatedAt: "2026-01-01T00:00:00.000Z" }]);

    assert(
        "F15 Storage.saveChats uses CHATS key",
        localStorage.getItem("ai_chat_chats") !== null
    );

    storage.setCurrentChat("chat_1");

    assert(
        "F15 Storage.setCurrentChat uses CURRENT_CHAT key",
        localStorage.getItem("ai_chat_current_chat") !== null
    );

    assert(
        "F15 Storage reads back what it wrote",
        storage.getCurrentChat() === "chat_1" &&
        storage.getChats().length === 1
    );

}


testTitleUpdatedSyncsSidebar();

testDeleteActiveChatClearsPersistence();

testDeleteInactiveChatKeepsCurrentChat();

testUpdateChatTitleEmitsEvent();

testCanonicalStorageKeys();

testStorageUsesCanonicalKeys();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}