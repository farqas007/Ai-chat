/* ===========================================================
   Integration test for Phase 3A: wiring the ai:request chat flow
   to api.streamMessage().

   Builds the REAL App (with Node stubs standing in for the DOM)
   and drives real chat events through app.js's registerEvents()
   so the shipped ai:request -> streamMessage wiring is what is
   under test. Verifies:

   - progressive deltas reach the SAME assistant bubble, and are
     never persisted to history;
   - Markdown is rendered exactly once, at stream completion;
   - stale late deltas from a switched-away chat never touch the
     active chat;
   - all completion/error/abort shapes finalize exactly once;
   - TTS speaks the final response once (never per chunk).
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
        removeMessage: [], streamUpdated: [], savedAssistantContents: [],
        renderCount: 0, speakText: null, speakCount: 0
    };

    // A spy over the real fallback storage so partial deltas can be
    // proven never to reach the persisted history.
    const rawSaveChats = storage.saveChats.bind(storage);

    storage.saveChats = chats => {
        calls.savedAssistantContents.push(
            chats.flatMap(chat =>
                chat.messages
                    .filter(m => m.role === "assistant")
                    .map(m => m.content)
            )
        );
        return rawSaveChats(chats);
    };

    const ui = {
        showTyping: v => calls.typing.push(v),
        showError: m => calls.errors.push(m),
        hideError: () => { calls.hideError++; },
        setSending: v => calls.sending.push(v),
        removeMessage: id => calls.removeMessage.push(id),
        updateStreamingMessage: (id, html, renderMarkdown) =>
            calls.streamUpdated.push([id, html, renderMarkdown]),
        appendMessage() {}, updateMessage() {}, renderChat() {},
        clearMessages() {}, showEmptyState() {}, setTitle() {},
        scrollToBottom() {}, setUnreadBadge() {},
        markdown: { render: t => t }
    };


    const app = new App();

    const chat = new Chat();

    chat.connect({ storage, ui });

    app.chat = chat;
    app.ui = ui;
    app.markdown = {
        render: t => {
            calls.renderCount++;
            return `<p>${t}</p>`;
        }
    };
    app.codeblock = { refresh() {} };
    app.voice = {
        speak: text => {
            calls.speakCount++;
            calls.speakText = text;
        },
        stopSpeaking() {}, destroy() {},
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
        calls.streamUpdated = [];
        calls.savedAssistantContents = [];
        calls.renderCount = 0;
        calls.speakText = null;
        calls.speakCount = 0;
    }

    return { app, chat, storage, store, calls, ui, resetCalls };

}


function findChat(store, id) {
    return store.chats.find(c => c.id === id);
}


const h = createHarness();

const { app, chat, store, calls } = h;


/* ===========================================================
   SCENARIO 1 — Deltas update the SAME bubble via
   chat.streamUpdate, never touch history, and Markdown is
   rendered exactly once at completion.
=========================================================== */

async function scenarioProgressiveStream() {

    h.resetCalls();

    app.settings.set("sound", true);

    app.api.streamMessage = async (_m, _h, callbacks) => {
        callbacks.onDelta("Hello ", "Hello ");
        callbacks.onDelta("world", "Hello world");
        callbacks.onDone("Hello world");
        return "Hello world";
    };

    const c = chat.createChat("Streaming Chat");

    Events.emit("chat:send", "skello");

    await settle();

    const messages = findChat(store, c.id).messages;

    assert(
        "P1 single user + single assistant message",
        messages.length === 2 &&
        messages[0].role === "user" &&
        messages[1].role === "assistant"
    );

    const assistant = messages[1];

    assert(
        "P1 assistant bubble carries the final rendered HTML",
        assistant.content === "<p>Hello world</p>"
    );

    const deltaUpdates = calls.streamUpdated.slice(0, 2);

    assert(
        "P1 both deltas piped through streamUpdate into the SAME assistant bubble",
        deltaUpdates.length === 2 &&
        deltaUpdates.every(([id]) => id === assistant.id) &&
        deltaUpdates[0][1] === "Hello " &&
        deltaUpdates[1][1] === "Hello world"
    );

    assert(
        "P1 deltas are raw text (markdown NOT rendered per chunk)",
        deltaUpdates.every(([, , flag]) => flag === false)
    );

    assert(
        "P1 Markdown rendered exactly once at completion",
        calls.renderCount === 1
    );

    assert(
        "P1 no partial delta ever persisted to history",
        calls.savedAssistantContents.every(
            contents => contents.every(content => content !== "Hello " && content !== "Hello world")
        )
    );

    assert(
        "P1 final content persisted once completed",
        calls.savedAssistantContents.some(
            contents => contents.includes("<p>Hello world</p>")
        )
    );

    assert(
        "P1 mocked final DOM update renders the completed Markdown",
        calls.streamUpdated.some(
            ([id, html, flag]) => id === assistant.id && html === "<p>Hello world</p>" && flag !== false
        )
    );

    assert(
        "P1 reply spoken exactly once with the full final text",
        calls.speakCount === 1 && calls.speakText === "Hello world"
    );

    assert(
        "P1 typing shown then hidden",
        calls.typing.includes(true) && calls.typing[calls.typing.length - 1] === false
    );

    assert(
        "P1 send lock released",
        app.state.sending === false &&
        calls.sending[calls.sending.length - 1] === false
    );

}


/* ===========================================================
   SCENARIO 2 — Stale late deltas from a switched-away chat are
   dropped; the late onDone still finalizes the ORIGIN chat.
=========================================================== */

async function scenarioStaleDeltaAfterSwitch() {

    h.resetCalls();

    let pending = null;

    app.api.streamMessage = (_m, _h, callbacks) => new Promise(resolve => {
        pending = {
            delta: txt => callbacks.onDelta(txt, txt),
            done: txt => {
                callbacks.onDone(txt);
                resolve(txt);
            }
        };
    });

    const a = chat.createChat("Origin A");

    Events.emit("chat:send", "from A");

    await settle();

    const aMessages = findChat(store, a.id).messages;

    assert(
        "S2 placeholder created in origin chat A",
        aMessages.length === 2 &&
        aMessages[1].role === "assistant" &&
        aMessages[1].content === ""
    );

    // Switch to a new chat before any chunk arrives.
    const b = chat.createChat("Active B");

    assert(
        "S2 chat B is now active",
        chat.state.currentChatId === b.id
    );

    // A stale chunk from the aborted-in-flight A request.
    pending.delta("<p>stale</p>");

    assert(
        "S2 stale delta never touches the DOM",
        calls.streamUpdated.length === 0
    );

    assert(
        "S2 stale delta never touches origin A's bubble",
        findChat(store, a.id).messages[1].content === ""
    );

    // The late completion still lands in the ORIGIN chat.
    pending.done("final from A");

    await settle();

    assert(
        "S2 late completion finalized origin chat A",
        findChat(store, a.id).messages.length === 2 &&
        findChat(store, a.id).messages[1].content === "<p>final from A</p>"
    );

    assert(
        "S2 active chat B untouched by A's stream",
        findChat(store, b.id).messages.length === 0
    );

    assert(
        "S2 no DOM stream update while a different chat is active",
        calls.streamUpdated.length === 0
    );

    assert(
        "S2 send lock released after late completion",
        app.state.sending === false
    );

    assert(
        "S2 typing indicator hidden after late completion",
        calls.typing[calls.typing.length - 1] === false
    );

}


/* ===========================================================
   SCENARIO 3 — Stream "error" event: onError fires and the stream
   RESOLVES with the partial content. Error surfaces once, partial
   content is preserved, and no empty assistant survives.
=========================================================== */

async function scenarioStreamErrorPreservesPartial() {

    h.resetCalls();

    app.api.streamMessage = async (_m, _h, callbacks) => {
        callbacks.onDelta("<p>partial</p>", "<p>partial</p>");
        callbacks.onError(new Error("stream blew up"));
        return "<p>partial</p>";
    };

    const c = chat.createChat("Error Chat");

    Events.emit("chat:send", "stream fail");

    await settle();

    const messages = findChat(store, c.id).messages;

    assert(
        "E1 partial assistant content preserved on stream error",
        messages.length === 2 &&
        messages[1].role === "assistant" &&
        messages[1].content === "<p>partial</p>"
    );

    assert(
        "E1 sanitized error surfaced",
        calls.errors.some(m => String(m).includes("stream blew up"))
    );

    assert(
        "E1 typing indicator cleared",
        calls.typing[calls.typing.length - 1] === false
    );

    assert(
        "E1 send lock released",
        app.state.sending === false
    );

    assert(
        "E1 Markdown never rendered on the error path",
        calls.renderCount === 0
    );

}


/* ===========================================================
   SCENARIO 4 — Silent abort: partials arrive, the stream resolves
   WITHOUT onDone/onError. finalizeAbort preserves the partial.
=========================================================== */

async function scenarioSilentAbort() {

    h.resetCalls();

    app.api.streamMessage = async (_m, _h, callbacks) => {
        callbacks.onDelta("partial", "partial");
        return "partial";
    };

    const c = chat.createChat("Abort Chat");

    Events.emit("chat:send", "abort me");

    await settle();

    const messages = findChat(store, c.id).messages;

    assert(
        "AB1 silent abort preserves the partial response",
        messages.length === 2 &&
        messages[1].role === "assistant" &&
        messages[1].content === "partial"
    );

    assert(
        "AB1 silent abort shows no error",
        calls.errors.length === 0
    );

    assert(
        "AB1 silent abort never rendered Markdown",
        calls.renderCount === 0
    );

    assert(
        "AB1 typing indicator cleared after silent abort",
        calls.typing[calls.typing.length - 1] === false
    );

    assert(
        "AB1 send lock released after silent abort",
        app.state.sending === false
    );

}


/* ===========================================================
   SCENARIO 5 — Exactly-once finalize: onDone fires and the stream
   resolves. No duplicate render, save, or assistant message.
=========================================================== */

async function scenarioExactlyOnceFinalize() {

    h.resetCalls();

    app.api.streamMessage = async (_m, _h, callbacks) => {
        callbacks.onDelta("once", "once");
        callbacks.onDone("once");
        return "once";
    };

    const c = chat.createChat("Done Chat");

    Events.emit("chat:send", "once please");

    await settle();

    const messages = findChat(store, c.id).messages;

    assert(
        "F1 single assistant message finalized",
        messages.length === 2 &&
        messages[1].role === "assistant" &&
        messages[1].content === "<p>once</p>"
    );

    assert(
        "F1 Markdown rendered exactly once",
        calls.renderCount === 1
    );

    assert(
        "F1 no duplicate final DOM update",
        calls.streamUpdated.filter(([, html]) => html === "<p>once</p>").length === 1
    );

    assert(
        "F1 send lock released exactly once at finalize",
        app.state.sending === false
    );

}


/* ===========================================================
   SCENARIO 6 — HTTP failure: onError fires AND the stream rejects.
   The error path finalizes exactly once — no doubled error surface,
   no doubled rollback.
=========================================================== */

async function scenarioHttpFailure() {

    h.resetCalls();

    app.api.streamMessage = async (_m, _h, callbacks) => {
        const err = new Error("http 500");
        callbacks.onError(err);
        throw err;
    };

    const c = chat.createChat("Http Chat");

    Events.emit("chat:send", "will fail");

    await settle();

    const messages = findChat(store, c.id).messages;

    assert(
        "H1 error surfaced for the HTTP failure",
        calls.errors.some(m => String(m).includes("http 500"))
    );

    assert(
        "H1 empty assistant placeholder rolled back",
        messages.length === 1 &&
        messages[0].role === "user" &&
        messages[0].content === "will fail"
    );

    assert(
        "H1 no empty assistant ghost persists",
        findChat(store, c.id).messages.every(m => m.content !== "")
    );

    assert(
        "H1 typing indicator cleared after HTTP failure",
        calls.typing[calls.typing.length - 1] === false
    );

    assert(
        "H1 send lock released after HTTP failure",
        app.state.sending === false
    );

    assert(
        "H1 Markdown never rendered on the HTTP failure path",
        calls.renderCount === 0
    );

    app.settings.set("sound", false);

}


/* ===========================================================
   RUN ALL SCENARIOS
=========================================================== */

await scenarioProgressiveStream();

await scenarioStaleDeltaAfterSwitch();

await scenarioStreamErrorPreservesPartial();

await scenarioSilentAbort();

await scenarioExactlyOnceFinalize();

await scenarioHttpFailure();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}