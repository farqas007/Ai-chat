/* ===========================================================
   Regression tests for the voice settings pipeline.

   F4: voiceSettings.load() must RETURN the loaded settings so
       merging them into the voice manager actually applies them.
   F5: VoicePlayer must use the CURRENT settings object (not the
       original literal captured in the constructor), and the
       playback rate must not be hardcoded.
   F9-regression: settings changes flow into the next playback.
=========================================================== */

globalThis.window = globalThis;

const capturedUtterances = [];

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
        capturedUtterances.push(this);
    }
};

globalThis.speechSynthesis = {
    getVoices: () => [],
    speak: utterance => {
        setImmediate(() => {
            if (utterance.onstart) {
                utterance.onstart();
            }
        });
        setImmediate(() => {
            if (utterance.onend) {
                utterance.onend();
            }
        });
    },
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    onvoiceschanged: null
};

globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    body: { appendChild() {} }
};

import { Voice } from "../js/voice.js";
import { VoiceSettings } from "../js/voiceSettings.js";
import { VoicePlayer } from "../js/voicePlayer.js";
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

function clearStorage() {
    localStorage.clear();
    capturedUtterances.length = 0;
}


/* -----------------------------------------------------------
   TEST 1 — save → reload → settings restored.
----------------------------------------------------------- */

async function testSaveReloadRestores() {

    clearStorage();

    const settings = new VoiceSettings();

    settings.update({
        rate: 1.5,
        pitch: 1.8,
        volume: 0.4,
        language: "roman"
    });

    settings.save();

    const reloaded = new VoiceSettings();

    const loaded = reloaded.load();

    assert(
        "T1 load() returns the settings object",
        loaded && typeof loaded === "object"
    );

    assert(
        "T1 saved rate restored",
        loaded.rate === 1.5
    );

    assert(
        "T1 saved pitch restored",
        loaded.pitch === 1.8
    );

    assert(
        "T1 saved volume restored",
        loaded.volume === 0.4
    );

    assert(
        "T1 saved language restored",
        loaded.language === "roman"
    );

    assert(
        "T1 merged defaults preserved",
        loaded.provider === "browser"
    );

    await settle();

}


/* -----------------------------------------------------------
   TEST 2 — load() with no saved data returns the defaults.
----------------------------------------------------------- */

async function testLoadWithoutSavedData() {

    clearStorage();

    const settings = new VoiceSettings();

    const loaded = settings.load();

    assert(
        "T2 load() returns defaults when nothing saved",
        loaded && loaded.rate === 1 && loaded.pitch === 1 &&
        loaded.volume === 1
    );

    await settle();

}


/* -----------------------------------------------------------
   TEST 3 — The player binds to the CURRENT settings object.
   Saved values must flow into voice.settings AND the player.
----------------------------------------------------------- */

async function testPlayerUsesLoadedSettings() {

    clearStorage();

    const settings = new VoiceSettings();

    settings.update({ rate: 1.25, pitch: 1.1, volume: 0.6 });

    settings.save();

    const voice = new Voice();

    voice.initialize();

    assert(
        "T3 voice.settings rate loaded",
        voice.settings.rate === 1.25
    );

    assert(
        "T3 player settings mirror current settings",
        voice.player.settings === voice.settings
    );

    await settle();

}


/* -----------------------------------------------------------
   TEST 4 — Playback rate is not hardcoded: the utterance uses
   the loaded settings.rate (not the old fixed 0.95).
----------------------------------------------------------- */

async function testPlaybackRateFromSettings() {

    clearStorage();

    const settings = new VoiceSettings();

    settings.update({ rate: 1.25, pitch: 1.1, volume: 0.6 });

    settings.save();

    const voice = new Voice();

    voice.initialize();

    voice.speak("hello world");

    await settle(30);

    const ut = capturedUtterances[capturedUtterances.length - 1];

    assert(
        "T4 an utterance was created",
        !!ut
    );

    assert(
        "T4 utterance rate equals settings rate",
        ut && ut.rate === 1.25
    );

    assert(
        "T4 utterance pitch equals settings pitch",
        ut && ut.pitch === 1.1
    );

    assert(
        "T4 utterance volume equals settings volume",
        ut && ut.volume === 0.6
    );

    assert(
        "T4 rate is not the old hardcoded 0.95",
        !ut || ut.rate !== 0.95
    );

    await settle();

}


/* -----------------------------------------------------------
   TEST 5 — Changing settings affects the NEXT playback.
----------------------------------------------------------- */

async function testChangingSettingsAffectsNextPlayback() {

    clearStorage();

    const voice = new Voice();

    voice.initialize();

    voice.speak("before change");

    await settle(30);

    // Apply new settings through the same channel the voice UI
    // uses.
    Events.emit("voice:settings:changed", {
        provider: "browser",
        language: "roman",
        rate: 1.7,
        pitch: 1.4,
        volume: 0.3,
        streaming: false,
        romanFallback: true
    });

    assert(
        "T5 voice.settings updated from settings:changed",
        voice.settings.rate === 1.7
    );

    assert(
        "T5 player settings updated from settings:changed",
        voice.player.settings === voice.settings &&
        voice.player.settings.rate === 1.7
    );

    voice.speak("after change");

    await settle(30);

    const ut = capturedUtterances[capturedUtterances.length - 1];

    assert(
        "T5 next utterance rate reflects new settings",
        ut && ut.rate === 1.7
    );

    assert(
        "T5 next utterance pitch reflects new settings",
        ut && ut.pitch === 1.4
    );

    await settle();

}


await testSaveReloadRestores();

await testLoadWithoutSavedData();

await testPlayerUsesLoadedSettings();

await testPlaybackRateFromSettings();

await testChangingSettingsAffectsNextPlayback();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}