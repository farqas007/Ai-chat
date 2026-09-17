/* =============================================================
   Regression tests — B3: unavailable voice providers.

   The UI still lists google / azure / elevenlabs / openai as
   selectable options, but none has a connected backend. Before
   B3, calling voiceProviders.setProvider("google") silently made
   "google" the ACTIVE provider while speak() routed through the
   browser player behind the scenes — a misleading runtime
   fallback. After B3:

   R1: setProvider("google") returns false.
   R2: the active provider stays "browser".
   R3: exactly one "voice:provider:unavailable" event is emitted
       with { name, fallbackTo: "browser" }.
   R4: the same holds for azure, elevenlabs and openai.
   R5: setProvider("browser") still works normally (returns true).
   R6: browser speech still reaches the player/browser TTS path.
   R7: unknown providers behave as before (return false, no
       event, active provider unchanged).
   R8: a persisted unavailable provider is rejected on restore —
       it can never become the active provider again.
============================================================= */

globalThis.window = globalThis;

const capturedUtterances = [];

globalThis.speechSynthesis = {
    getVoices: () => [],
    speak: () => {},
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    onvoiceschanged: null,
    speaking: false,
    paused: false
};

globalThis.SpeechSynthesisUtterance = function (text) {

    const u = {
        text,
        rate: 1, pitch: 1, volume: 1, lang: "",
        voice: null,
        onstart: null, onend: null, onerror: null
    };

    capturedUtterances.push(u);

    return u;

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
        dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {}, addEventListener() {}, setAttribute() {},
        remove() {}, focus() {}
    }),
    addEventListener() {},
    body: { appendChild() {}, style: {} }
};

import { VoiceProviders } from "../js/voiceProviders.js";
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


/* -----------------------------------------------------------
   Test all four unavailable providers behave identically:
   setProvider rejects, browser stays active, exactly one
   event carries { name, fallbackTo: "browser" }.
----------------------------------------------------------- */

async function testUnavailableProviders() {

    const unavailable = [ "google", "azure", "elevenlabs", "openai" ];

    for (const name of unavailable) {

        const vp = new VoiceProviders();

        let calls = 0;
        let payload = null;

        const handler = data => { calls++; payload = data; };

        Events.on("voice:provider:unavailable", handler);

        const result = vp.setProvider(name);

        Events.off("voice:provider:unavailable", handler);

        assert(
            `R1/4 setProvider rejects "${name}"`,
            result === false
        );

        assert(
            `R2/4 "${name}" never becomes active — provider stays browser`,
            vp.getProvider() === "browser"
        );

        assert(
            `R3/4 "${name}" emits voice:provider:unavailable exactly once`,
            calls === 1
        );

        assert(
            `R4/4 "${name}" payload = { name, fallbackTo: "browser" }`,
            payload &&
            payload.name === name &&
            payload.fallbackTo === "browser"
        );

    }

}


/* -----------------------------------------------------------
   Browser provider keeps working normally.
----------------------------------------------------------- */

async function testBrowserProvider() {

    const vp = new VoiceProviders();

    const setOk = vp.setProvider("browser");

    assert(
        "R5 setProvider('browser') returns true",
        setOk === true
    );

    assert(
        "R5 browser is the active provider",
        vp.getProvider() === "browser"
    );

    let played = 0;

    const player = {
        play: () => { played++; return true; }
    };

    const result = await vp.speak({
        player,
        text: "assalam o alaikum",
        lang: "ur-PK"
    });

    assert(
        "R6 browser speak reaches the player",
        played === 1
    );

    assert(
        "R6 speak returns truthy (player result)",
        Boolean(result)
    );

}


/* -----------------------------------------------------------
   Unknown provider — existing behavior preserved.
----------------------------------------------------------- */

async function testUnknownProvider() {

    const vp = new VoiceProviders();

    let calls = 0;
    const handler = () => { calls++; };

    Events.on("voice:provider:unavailable", handler);

    /* Before B3 setProvider(unknown) warned and returned
       undefined/false without emitting. B3 keeps that. */
    const result = vp.setProvider("some-random-nonsense");

    Events.off("voice:provider:unavailable", handler);

    assert(
        "R7 unknown provider returns false",
        result === false
    );

    assert(
        "R7 unknown provider does NOT emit voice:provider:unavailable",
        calls === 0
    );

    assert(
        "R7 unknown provider leaves browser active",
        vp.getProvider() === "browser"
    );

}


/* -----------------------------------------------------------
   Restore path: a persisted unavailable provider can never
   become the active provider again. (VoiceSettings persistence +
   a setProvider attempt simulates a restore from old state.)
----------------------------------------------------------- */

async function testPersistedUnavailableRestore() {

    const vp = new VoiceProviders();

    /* Simulate an old persisted provider being offered back. */
    const attemptedRestore = [ "google", "azure", "elevenlabs", "openai" ];

    for (const persisted of attemptedRestore) {

        let calls = 0 | 0; /* keep a fresh counter per iteration below? */
        let events = 0;

        const handler = () => { events++; };

        Events.on("voice:provider:unavailable", handler);

        const accepted = vp.setProvider(persisted);

        Events.off("voice:provider:unavailable", handler);

        assert(
            `R8 persisted "${persisted}" is rejected on restore`,
            accepted === false
        );

        assert(
            `R8 after restoring "${persisted}" browser is still active`,
            vp.getProvider() === "browser"
        );

        assert(
            `R8 restore of "${persisted}" surfaced the unavailable event`,
            events === 1
        );

    }

}


await testUnavailableProviders();

await testBrowserProvider();

await testUnknownProvider();

await testPersistedUnavailableRestore();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}
