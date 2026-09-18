/* ===========================================================
   Regression tests — BUG-2: unavailable-provider feedback.

   VoiceProviders emits "voice:provider:unavailable" when a
   UI-selected provider has no connected backend (B3). Before
   BUG-2 nothing in production listened, so the user got no
   feedback.

   After BUG-2 the App registers exactly one listener that
   surfaces the message through the existing showError UI.

     F1: exactly one listener is registered for the event.
     F2: emitting the event calls showError once with a message
         naming the provider and the browser fallback.
     F3: a payload-less event still shows a fallback message and
         never throws.
     F4: re-emitting does not duplicate the listener.
=========================================================== */

globalThis.window = globalThis;

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

globalThis.speechSynthesis = {
    getVoices: () => [],
    cancel: () => {},
    speak: () => {},
    pause: () => {},
    resume: () => {},
    onvoiceschanged: null
};

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

    Events.clear();

    const app = new App();

    const errors = [];

    app.ui = {
        showError: message => errors.push(message),
        showTyping: () => {},
        hideError: () => {},
        setSending: () => {},
        renderChat: () => {},
        markdown: { render: t => t }
    };

    app.chat = { addMessage: () => true };

    app.registerEvents();

    return { app, errors };

}


/* -----------------------------------------------------------
   F1 + F2 — single listener, useful feedback.
----------------------------------------------------------- */

function testUnavailableFeedback() {

    const { errors } = createHarness();

    assert(
        "F1 exactly one listener is registered",
        Events.listenerCount("voice:provider:unavailable") === 1
    );

    Events.emit("voice:provider:unavailable", {
        name: "google",
        fallbackTo: "browser"
    });

    assert(
        "F2 showError called exactly once",
        errors.length === 1
    );

    assert(
        "F2 message names the provider and the browser fallback",
        typeof errors[0] === "string" &&
        errors[0].includes("google") &&
        errors[0].includes("browser")
    );

}


/* -----------------------------------------------------------
   F3 — payload-less event is safe and still informative.
----------------------------------------------------------- */

function testPayloadlessFeedback() {

    const { errors } = createHarness();

    let threw = false;

    try {
        Events.emit("voice:provider:unavailable");
    } catch {
        threw = true;
    }

    assert(
        "F3 payload-less event does not throw",
        !threw
    );

    assert(
        "F3 payload-less event still shows a fallback message",
        errors.length === 1 && errors[0].includes("browser")
    );

}


/* -----------------------------------------------------------
   F4 — re-emitting does not duplicate the listener or feedback.
----------------------------------------------------------- */

function testNoDuplicateListener() {

    const { errors } = createHarness();

    Events.emit("voice:provider:unavailable", { name: "azure" });
    Events.emit("voice:provider:unavailable", { name: "azure" });

    assert(
        "F4 still exactly one listener after two emits",
        Events.listenerCount("voice:provider:unavailable") === 1
    );

    assert(
        "F4 exactly one feedback per emit (no duplication)",
        errors.length === 2
    );

}


testUnavailableFeedback();

testPayloadlessFeedback();

testNoDuplicateListener();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}
