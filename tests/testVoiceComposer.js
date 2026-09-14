/* ===========================================================
   Test: composer voice input wiring. Verifies:

   - The voice-input:toggle event starts/stops recognition.
   - Transcripts land in the composer via ui.insertVoiceText.
   - Voice input NEVER auto-sends (no chat:send emission).
   - start/end/error events drive the listening UI state.
   - Unsupported/disabled state is reflected on the mic button.
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

function makeClassList() {
    const classes = new Set();
    return {
        toggle(cls, force) {
            const on = force === undefined ? !classes.has(cls) : !!force;
            if (on) classes.add(cls); else classes.delete(cls);
        },
        contains: cls => classes.has(cls)
    };
}

function makeButton() {
    const attrs = {};
    return {
        disabled: false,
        title: "",
        attrs,
        classList: makeClassList(),
        setAttribute(name, value) {
            attrs[name] = value;
        }
    };
}


/* A real UI instance (built on the empty document stub) drives
   the composer button directly via the new UI methods. */

const app = new App();
app.registerEvents();

const btn = makeButton();
app.ui.elements.voiceInputBtn = btn;

const input = {
    value: "typed ",
    focusCount: 0,
    focus() {
        input.focusCount += 1;
    }
};
app.ui.elements.input = input;


/* Supported state on the mic button. */

app.ui.setVoiceInputSupported(true);
assert("supported hides nothing", !btn.classList.contains("voice-unsupported"));
assert("supported enables button", btn.disabled === false);
assert("supported aria-disabled", btn.attrs["aria-disabled"] === "false");

app.ui.setVoiceInputSupported(false);
assert("unsupported adds class", btn.classList.contains("voice-unsupported"));
assert("unsupported disables button", btn.disabled === true);
assert("unsupported aria-disabled", btn.attrs["aria-disabled"] === "true");
assert("unsupported aria-hidden", btn.attrs["aria-hidden"] === "true");

app.ui.setVoiceInputSupported(true);


/* Listening state on the mic button. */

app.ui.setVoiceInputListening(true);
assert("listening class added", btn.classList.contains("listening"));
assert("aria-pressed true", btn.attrs["aria-pressed"] === "true");
assert("title stop", btn.title === "Stop voice input");

app.ui.setVoiceInputListening(false);
assert("listening class removed", !btn.classList.contains("listening"));
assert("aria-pressed false", btn.attrs["aria-pressed"] === "false");
assert("title idle", btn.title === "Voice input");


/* insertVoiceText merges into existing composer text. */

app.ui.insertVoiceText("hello");
assert("insert merges text", input.value === "typed hello");
assert("insert focuses input", input.focusCount === 1);

app.ui.insertVoiceText("hello");
assert("insert suppresses duplicate", input.value === "typed hello");

app.ui.insertVoiceText("again");
assert("insert appends new text", input.value === "typed hello again");


/* App-level wiring with stubbed collaborators. */

function createWireHarness() {

    const real = new App();

    const log = [];
    const wire = {
        sendCount: 0,
        startCalls: 0,
        stopCalls: 0,
        destroyed: 0,
        ui: {
            setVoiceInputSupported: s => log.push(["support", s]),
            setVoiceInputListening: l => log.push(["listening", l]),
            insertVoiceText: t => log.push(["text", t]),
            showError: m => log.push(["error", m])
        },
        voiceInput: {
            isListening: false,
            start: () => {
                wire.startCalls += 1;
                return true;
            },
            stop: () => {
                wire.stopCalls += 1;
            },
            destroy: () => {
                wire.destroyed += 1;
            }
        },
        voice: {
            settings: { language: "en-US" },
            destroy: () => {}
        },
        chat: {
            sendMessage: () => {
                wire.sendCount += 1;
            },
            destroy: () => {}
        }
    };

    real.ui = wire.ui;
    real.voiceInput = wire.voiceInput;
    real.voice = wire.voice;
    real.chat = wire.chat;
    real.registerEvents();

    Events.on("chat:send", () => {
        wire.sendCount += 1;
    });

    return { real, wire, log };

}


{
    const { wire } = createWireHarness();

    Events.emit("voice-input:toggle");
    assert("toggle starts when idle", wire.startCalls === 1 && wire.stopCalls === 0);

    wire.voiceInput.isListening = true;
    Events.emit("voice-input:toggle");
    assert("toggle stops when listening", wire.stopCalls === 1 && wire.startCalls === 1);
}

{
    const { wire, log } = createWireHarness();

    Events.emit("voice-input:start");
    Events.emit("voice-input:end");
    Events.emit("voice-input:end");

    const listening = log.filter(entry => entry[0] === "listening");
    assert(
        "start/end drive listening UI",
        listening.length === 3 &&
            listening[0][1] === true &&
            listening[1][1] === false
    );
}

{
    const { wire, log } = createWireHarness();

    Events.emit("voice-input:error", "No speech was detected.");

    const err = log.filter(entry => entry[0] === "error");
    assert(
        "error surfaces friendly message",
        err.length === 1 && err[0][1] === "No speech was detected."
    );

    const listening = log.filter(entry => entry[0] === "listening");
    assert(
        "error resets listening UI",
        listening.length === 1 && listening[0][1] === false
    );
}

{
    const { wire, log } = createWireHarness();

    Events.emit("voice-input:text", "hello world");
    Events.emit("voice-input:text", "more words");

    const text = log.filter(entry => entry[0] === "text");
    assert(
        "transcripts go to composer",
        text.length === 2 &&
            text[0][1] === "hello world" &&
            text[1][1] === "more words"
    );

    assert("voice input never auto-sends", wire.sendCount === 0);
}


if (failed.length > 0) {
    console.log(`\nVoiceComposer: ${failed.length} FAILED`);
    process.exit(1);
}

console.log(`\nVoiceComposer: ${passed.length} passed`);