/* ===========================================================
   Regression tests — BUG-1: voice provider selection wiring.

   Before BUG-1 the voice settings UI persisted a "provider" and
   emitted "voice:settings:changed", but nothing ever called
   VoiceProviders.setProvider(), so the selection was inert.

   After BUG-1 the production settings-change path applies the
   selected provider and the B3 contract still holds:
     S1: browser selection reaches setProvider and becomes active.
     S2: each unavailable provider reaches setProvider, is rejected,
         emits voice:provider:unavailable exactly once and browser
         stays active.
     S3: persisted settings are corrected to the active provider so
         provider state and saved settings never drift apart.
     S4: a persisted unavailable provider is rejected on init.
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

globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
        this.text = text;
        this.rate = 0;
        this.pitch = 0;
        this.volume = 0;
        this.lang = "";
        this.voice = null;
    }
};

globalThis.speechSynthesis = {
    getVoices: () => [],
    speak: () => {},
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    onvoiceschanged: null
};

globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    body: { appendChild() {}, style: {} }
};

import { Voice } from "../js/voice.js";
import { VoiceSettings } from "../js/voiceSettings.js";
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


function makeVoice() {

    Events.clear();
    localStorage.clear();

    const voice = new Voice();

    voice.initialize();

    return voice;

}


/* -----------------------------------------------------------
   S1 — browser selection reaches setProvider and stays active.
----------------------------------------------------------- */

function testBrowserSelection() {

    const voice = makeVoice();

    const calls = [];
    const real = voice.providers.setProvider.bind(voice.providers);

    voice.providers.setProvider = name => {
        calls.push(name);
        return real(name);
    };

    Events.emit("voice:settings:changed", {
        provider: "browser",
        rate: 1,
        pitch: 1,
        volume: 1
    });

    assert(
        "S1 settings change reaches setProvider(\"browser\")",
        calls.includes("browser")
    );

    assert(
        "S1 browser is the active provider",
        voice.providers.getProvider() === "browser"
    );

}


/* -----------------------------------------------------------
   S2 — each unavailable provider is rejected through the
   production settings-change path.
----------------------------------------------------------- */

function testUnavailableSelection() {

    const unavailable = [ "google", "azure", "elevenlabs", "openai" ];

    for (const name of unavailable) {

        const voice = makeVoice();

        const calls = [];
        const real = voice.providers.setProvider.bind(voice.providers);

        voice.providers.setProvider = requested => {
            calls.push(requested);
            return real(requested);
        };

        let events = 0;
        let payload = null;

        const handler = data => { events++; payload = data; };

        Events.on("voice:provider:unavailable", handler);

        Events.emit("voice:settings:changed", { provider: name });

        Events.off("voice:provider:unavailable", handler);

        assert(
            `S2 "${name}" reaches setProvider from the settings path`,
            calls.includes(name)
        );

        assert(
            `S2 "${name}" is rejected — browser stays active`,
            voice.providers.getProvider() === "browser"
        );

        assert(
            `S2 "${name}" emits voice:provider:unavailable exactly once`,
            events === 1
        );

        assert(
            `S2 "${name}" payload = { name, fallbackTo: "browser" }`,
            payload &&
            payload.name === name &&
            payload.fallbackTo === "browser"
        );

        assert(
            `S2 "${name}" persisted setting is corrected to browser`,
            voice.settings.provider === "browser" &&
            voice.config.get("provider") === "browser"
        );

    }

}


/* -----------------------------------------------------------
   S4 — a persisted unavailable provider is rejected on init.
----------------------------------------------------------- */

function testPersistedUnavailableOnInit() {

    Events.clear();
    localStorage.clear();

    const config = new VoiceSettings();

    config.set("provider", "google");
    config.save();

    const voice = new Voice();

    voice.initialize();

    assert(
        "S4 persisted unavailable provider never becomes active",
        voice.providers.getProvider() === "browser"
    );

    assert(
        "S4 persisted provider corrected to browser on init",
        voice.config.get("provider") === "browser"
    );

}


testBrowserSelection();

testUnavailableSelection();

testPersistedUnavailableOnInit();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}
