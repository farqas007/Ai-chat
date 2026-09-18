/* ===========================================================
   Regression tests for PH06-3 — voice command bridge.

   The live VoiceInput recognition path emits "voice-input:text".
   Recognized speech must be routed through the existing
   VoiceCommands dispatcher:
     * recognized command  -> the existing command event listener
       runs and the command text is NOT inserted into the composer;
     * non-command speech  -> text IS inserted into the composer
       and recorded via setLastSpeech() so "repeat" can speak it.

   This exercises the REAL VoiceCommands implementation and the
   existing app.js command event listeners found in
   tests/testVoiceCommandWiring.js (B1/B2 wiring stays intact).
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

    const calls = {
        stopSpeaking: 0,
        pause: 0,
        resume: 0,
        speak: [],
        composeInserts: [],
        chatCreates: 0,
        chatClears: 0,
        voiceUIShows: 0
    };

    const app = new App();

    // app.voice.commands is the REAL VoiceCommands instance created by
    // the Voice constructor; only the downstream TTS/UI/chat effects are
    // stubbed so actions can be observed without side effects.
    app.voice.stopSpeaking = () => { calls.stopSpeaking++; };

    app.voice.player = {
        pause: () => { calls.pause++; },
        resume: () => { calls.resume++; }
    };

    app.voice.speak = text => { calls.speak.push(text); };

    app.voiceUI = {
        modal: { style: { display: "none" } },
        show: () => { calls.voiceUIShows++; },
        hide: () => {}
    };

    app.chat = {
        createChat: () => { calls.chatCreates++; },
        clearChat: () => { calls.chatClears++; }
    };

    app.ui = {
        insertVoiceText: text => { calls.composeInserts.push(text); }
    };

    app.registerEvents();

    return { app, calls };

}


/* -----------------------------------------------------------
   Recognized commands trigger their existing action and are NOT
   inserted into the composer.
----------------------------------------------------------- */

function testRecognizedCommandsNotInserted() {

    Events.clear();

    const { calls } = createHarness();

    Events.emit("voice-input:text", "stop");

    assert("PH06-3 stop invokes the voice:stop listener",
        calls.stopSpeaking === 1);

    assert("PH06-3 stop is not inserted into the composer",
        calls.composeInserts.length === 0);

    Events.emit("voice-input:text", "pause");

    assert("PH06-3 pause invokes the voice:pause listener",
        calls.pause === 1);

    Events.emit("voice-input:text", "resume");

    assert("PH06-3 resume invokes the voice:resume listener",
        calls.resume === 1);

    Events.emit("voice-input:text", "new chat");

    assert("PH06-3 new chat invokes the chat:new listener",
        calls.chatCreates === 1);

    Events.emit("voice-input:text", "clear chat");

    assert("PH06-3 clear chat invokes the chat:clear listener",
        calls.chatClears === 1);

    Events.emit("voice-input:text", "settings");

    assert("PH06-3 settings invokes the voice:settings listener",
        calls.voiceUIShows === 1);

    assert("PH06-3 no recognized command text reached the composer",
        calls.composeInserts.length === 0);

}


/* -----------------------------------------------------------
   Command matching stays case/whitespace-insensitive (the existing
   VoiceCommands.handle normalization) without reaching the composer.
----------------------------------------------------------- */

function testCommandNormalization() {

    Events.clear();

    const { calls } = createHarness();

    Events.emit("voice-input:text", "  STOP  ");

    assert("PH06-3 normalized stop still triggers the listener",
        calls.stopSpeaking === 1);

    assert("PH06-3 normalized stop is not inserted",
        calls.composeInserts.length === 0);

    Events.emit("voice-input:text", "Clear Chat");

    assert("PH06-3 normalized clear chat triggers the listener",
        calls.chatClears === 1);

    assert("PH06-3 no normalized command text reached the composer",
        calls.composeInserts.length === 0);

}


/* -----------------------------------------------------------
   Non-command speech is inserted into the composer exactly as
   before, triggers no command actions, and updates lastSpeech.
----------------------------------------------------------- */

function testNonCommandSpeechInserted() {

    Events.clear();

    const { app, calls } = createHarness();

    Events.emit("voice-input:text", "hello world");

    assert("PH06-3 non-command text is inserted into the composer",
        calls.composeInserts.length === 1 &&
        calls.composeInserts[0] === "hello world");

    assert("PH06-3 non-command text triggers no command actions",
        calls.stopSpeaking === 0 &&
        calls.pause === 0 &&
        calls.resume === 0 &&
        calls.chatCreates === 0 &&
        calls.chatClears === 0 &&
        calls.voiceUIShows === 0 &&
        calls.speak.length === 0);

    assert("PH06-3 last speech is recorded via setLastSpeech()",
        app.voice.commands.lastSpeech === "hello world");

}


/* -----------------------------------------------------------
   The repeat command speaks the most recent non-command speech,
   command utterances never clobber lastSpeech, and repeat itself
   is not inserted into the composer.
----------------------------------------------------------- */

function testRepeatUsesLastNonCommandSpeech() {

    Events.clear();

    const { app, calls } = createHarness();

    Events.emit("voice-input:text", "please write a poem");

    Events.emit("voice-input:text", "repeat");

    assert("PH06-3 repeat speaks the last non-command speech",
        calls.speak.length === 1 &&
        calls.speak[0] === "please write a poem");

    assert("PH06-3 repeat is not inserted into the composer",
        calls.composeInserts.length === 1);

    Events.emit("voice-input:text", "clear chat");

    assert("PH06-3 a command does not overwrite lastSpeech",
        app.voice.commands.lastSpeech === "please write a poem");

}


/* -----------------------------------------------------------
   Empty/invalid recognition results keep the pre-bridge behavior:
   they still reach the composer, do not throw, and do not clobber
   lastSpeech.
----------------------------------------------------------- */

function testEmptyTextPreserved() {

    Events.clear();

    const { app, calls } = createHarness();

    app.voice.commands.setLastSpeech("previous transcript");

    Events.emit("voice-input:text", "");

    assert("PH06-3 empty result still reaches the composer as today",
        calls.composeInserts.length === 1 &&
        calls.composeInserts[0] === "");

    assert("PH06-3 empty result does not clobber lastSpeech",
        app.voice.commands.lastSpeech === "previous transcript");

    assert("PH06-3 empty result triggers no command action",
        calls.stopSpeaking === 0 &&
        calls.pause === 0 &&
        calls.resume === 0);

}


/* -----------------------------------------------------------
   Safety: without an app.voice instance the handler falls back to
   the original behavior and never throws.
----------------------------------------------------------- */

function testNoVoiceInstanceFallsBackToComposer() {

    Events.clear();

    const { app, calls } = createHarness();

    app.voice = null;

    let threw = false;

    try {

        Events.emit("voice-input:text", "stop");

    } catch (error) {

        threw = true;

    }

    assert("PH06-3 missing voice instance does not throw",
        !threw);

    assert("PH06-3 missing voice instance still inserts the text",
        calls.composeInserts.length === 1 &&
        calls.composeInserts[0] === "stop");

}


testRecognizedCommandsNotInserted();

testCommandNormalization();

testNonCommandSpeechInserted();

testRepeatUsesLastNonCommandSpeech();

testEmptyTextPreserved();

testNoVoiceInstanceFallsBackToComposer();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}