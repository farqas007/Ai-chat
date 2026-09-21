/* ===========================================================
   Regression tests for F2 — Image generation UX flow.

   Covers the app-level wiring in js/app.js:
   - a successfully generated image is persisted through the
     existing chat-history mechanism (no new storage layer);
   - restored history still contains the generated image;
   - image:start/end show/hide the loading state and lock the
     image button;
   - image:error surfaces a user-facing error and clears the
     loading state;
   - image:generate is ignored while another generation is
     already in progress (duplicate prevention);
   - the pre-existing showGeneratedImage live bubble is used as a
     fallback when no chat is active (old behavior preserved).

   No real provider/API calls are made and nothing is written to
   the repository (in-memory storage + a fake UI only).
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
    createElement: (tag) => {
        const el = {
            tagName: tag || "div",
            className: "", innerHTML: "", style: {},
            src: "", alt: "",
            dataset: {},
            classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
            appendChild() {}, addEventListener() {},
            setAttribute() {}, remove() {}, focus() {},
            querySelector: () => null
        };
        Object.defineProperty(el, "outerHTML", {
            get() {
                const t = el.tagName || "div";
                let attrs = "";
                if (el.src) attrs += ` src="${el.src}"`;
                if (el.alt) attrs += ` alt="${el.alt}"`;
                if (el.className) attrs += ` class="${el.className}"`;
                const VOID = new Set(["img","br","hr","input","meta","link"]);
                if (VOID.has(t)) return `<${t}${attrs}>`;
                return `<${t}${attrs}></${t}>`;
            }
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
        typing: [], errors: [], liveImages: 0, rendered: []
    };

    const imageButton = { disabled: false };

    const ui = {
        elements: { imageButton },
        showTyping: v => calls.typing.push(v),
        showError: m => calls.errors.push(m),
        hideError: () => {},
        setSending: () => {},
        removeMessage: () => {},
        updateStreamingMessage: () => {},
        renderChat: messages => calls.rendered.push(messages.map(m => ({ ...m }))),
        appendMessage() {}, updateMessage() {}, clearMessages() {},
        showEmptyState() {}, setTitle() {}, scrollToBottom() {},
        setUnreadBadge() {}, setVoiceInputSupported() {},
        showGeneratedImage: () => { calls.liveImages++; },
        markdown: { render: t => t }
    };

    const app = new App();

    const chat = new Chat();

    chat.connect({ storage, ui });

    app.chat = chat;
    app.ui = ui;
    app.markdown = { render: t => t };

    app.registerEvents();

    return { app, chat, storage, store, calls, ui, imageButton };

}


const h = createHarness();

const { app, chat, store, calls, imageButton } = h;


function findChat(id) {
    return store.chats.find(c => c.id === id);
}


/* -----------------------------------------------------------
   TEST 1 — a generated image is persisted as an assistant
   message via the existing chat-history mechanism.
----------------------------------------------------------- */

function testImagePersistedToChatHistory() {

    const created = chat.createChat("Image Chat");

    const chatId = created.id;

    Events.emit("image:created", {
        id: "img_1",
        url: "https://img.example.com/cat.png",
        prompt: "a cat"
    });

    const saved = findChat(chatId);

    const imageMessage = saved.messages.find(m => {
        return m.role === "assistant" && m.content.includes("<img");
    });

    assert(
        "T1 generated image persisted to the chat history",
        imageMessage !== undefined
    );

    assert(
        "T1 persisted content references the image URL",
        imageMessage && imageMessage.content.includes("https://img.example.com/cat.png")
    );

    assert(
        "T1 persisted content is a safe img tag",
        imageMessage && /^<img src="[^"]+" alt="Generated image">$/.test(imageMessage.content)
    );

}


/* -----------------------------------------------------------
   TEST 2 — restoring the chat renders the persisted image
   message back into the conversation.
----------------------------------------------------------- */

function testRestoredHistoryContainsImage() {

    calls.rendered = [];

    Events.emit("chat:selected", "unknown_chat_id");
    Events.emit("chat:selected", store.current);

    const restored = calls.rendered[calls.rendered.length - 1] || [];

    const imageMessage = restored.find(m => {
        return m.role === "assistant" && m.content.includes("<img");
    });

    assert(
        "T2 restored history still contains the generated image message",
        imageMessage !== undefined
    );

}


/* -----------------------------------------------------------
   TEST 3 — loading state: image:start shows typing + disables
   the button; image:end hides typing + re-enables the button.
----------------------------------------------------------- */

function testLoadingStateLifecycle() {

    Events.emit("image:start");

    assert(
        "T3 image:start shows the loading indicator",
        calls.typing[calls.typing.length - 1] === true
    );

    assert(
        "T3 image:start disables the image button",
        imageButton.disabled === true
    );

    Events.emit("image:end");

    assert(
        "T3 image:end hides the loading indicator",
        calls.typing[calls.typing.length - 1] === false
    );

    assert(
        "T3 image:end re-enables the image button",
        imageButton.disabled === false
    );

}


/* -----------------------------------------------------------
   TEST 4 — failure: image:error surfaces a user-facing error
   and the loading state is cleared.
----------------------------------------------------------- */

function testFailureShowsErrorAndClearsLoading() {

    Events.emit("image:start");

    Events.emit("image:error", { message: "provider boom" });

    assert(
        "T4 failure hides the loading indicator",
        calls.typing[calls.typing.length - 1] === false
    );

    assert(
        "T4 failure shows a user-facing error",
        calls.errors[calls.errors.length - 1] === "provider boom"
    );

    Events.emit("image:end");

    assert(
        "T4 button re-enabled after failure",
        imageButton.disabled === false
    );

}


/* -----------------------------------------------------------
   TEST 5 — duplicate prevention: image:generate is ignored
   while a generation is already loading.
----------------------------------------------------------- */

async function testDuplicateGenerationIgnored() {

    let generateCalls = 0;

    app.imageGenerator.generate = async () => {
        generateCalls++;
        return { id: "img_2", url: "https://img.example.com/x.png" };
    };

    app.imageGenerator.state.loading = true;

    Events.emit("image:generate", "first prompt");

    Events.emit("image:generate", "second prompt");

    await settle();

    assert(
        "T5 duplicate image:generate ignored while loading",
        generateCalls === 0
    );

    app.imageGenerator.state.loading = false;

    Events.emit("image:generate", "third prompt");

    await settle();

    assert(
        "T5 image:generate works once loading is cleared",
        generateCalls === 1
    );

    app.imageGenerator.generate = () => Promise.resolve(null);

}


/* -----------------------------------------------------------
   TEST 6 — fallback: with no active chat, the pre-existing live
   showGeneratedImage bubble is still used (old behavior).
----------------------------------------------------------- */

function testNoActiveChatFallsBackToLiveBubble() {

    chat.state.currentChatId = null;
    chat.state.messages = [];

    const liveBefore = calls.liveImages;

    Events.emit("image:created", {
        id: "img_3",
        url: "https://img.example.com/none.png",
        prompt: "a dog"
    });

    assert(
        "T6 no active chat falls back to showGeneratedImage",
        calls.liveImages === liveBefore + 1
    );

}


testImagePersistedToChatHistory();

testRestoredHistoryContainsImage();

testLoadingStateLifecycle();

testFailureShowsErrorAndClearsLoading();

await testDuplicateGenerationIgnored();

testNoActiveChatFallsBackToLiveBubble();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}