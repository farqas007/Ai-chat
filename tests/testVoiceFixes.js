/* ===========================================================
   Regression tests for voice pipeline fixes.

   F6: voice:speak:start / voice:speak:end fire EXACTLY ONCE per
       utterance. The VoicePlayer (the single TTS lifecycle
       owner) is the only emitter; the callbacks passed by the
       VoiceManager previously re-emitted the same events,
       doubling them for every utterance.
   F7: a synchronous throw from synthesis.speak() no longer
       stalls the queue forever — it is reported immediately
       (voice:speak:error) and the queue advances to the next
       chunk.
   F8: roman-urdu detection uses whole-word matching, so
       substrings ("hai" inside "khair") never trigger a false
       positive.
=========================================================== */


globalThis.window = globalThis;

let speakImpl = null;

globalThis.speechSynthesis = {
    getVoices: () => [],
    cancel: () => {},
    speak: text => {
        const impl = speakImpl || (() => {});
        return impl(text);
    },
    pause: () => {},
    resume: () => {},
    onvoiceschanged: null,
    speaking: false,
    paused: false
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

const spoken = [];

globalThis.SpeechSynthesisUtterance = function (text) {

    const utterance = {
        text,
        rate: 1,
        pitch: 1,
        volume: 1,
        voice: null,
        lang: "",
        onstart: null,
        onend: null,
        onerror: null
    };

    spoken.push(utterance);

    setImmediate(() => {
        if (utterance.onstart) {
            utterance.onstart();
        }
        setImmediate(() => {
            if (utterance.onend) {
                utterance.onend();
            }
        });
    });

    return utterance;

};


import Events from "../js/events.js";
import { Voice } from "../js/voice.js";
import { VoicePlayer } from "../js/voicePlayer.js";


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

function settle(ms = 40) {
    return new Promise(r => setTimeout(r, ms));
}

function countEmissions(label) {
    return new Promise(resolve => {
        let n = 0;
        const handler = () => { n++; };
        Events.on(label, handler);
        setTimeout(() => {
            Events.off(label, handler);
            resolve(n);
        }, 30);
    });
}


/* -----------------------------------------------------------
   F8 — whole-word roman-urdu detection (pure).
----------------------------------------------------------- */

function testRomanUrduDetection() {

    const voice = new Voice();

    assert(
        "F8 true positive: 'aap kaise hain' is roman urdu",
        voice.isRomanUrdu("aap kaise hain") === true
    );

    assert(
        "F8 true positive: 'muja aap ka koi masala nahi' is roman urdu",
        voice.isRomanUrdu("mujhe aap ka koi masala nahi") === true
    );

    assert(
        "F8 no false positive: 'hidden' substring of 'hai' not matched",
        voice.isRomanUrdu("There was fear inside the hidden room") === false
    );

    assert(
        "F8 no false positive: 'hai' inside 'khair' ignored",
        voice.isRomanUrdu("khair, the whole journey was fine") === false
    );

    assert(
        "F8 no false positive: 'kyun' inside 'skunked' ignored",
        voice.isRomanUrdu("The skunked carton of milk") === false
    );

    assert(
        "F8 words counted exactly with a threshold of two",
        voice.isRomanUrdu("aap yahan hain") === true
    );

    assert(
        "F8 case insensitive",
        voice.isRomanUrdu("AAP KAISE HAIN") === true
    );

    assert(
        "F8 non-string input never throws",
        (() => {
            try {
                voice.isRomanUrdu(null) === false;
                voice.isRomanUrdu(undefined) === false;
                return true;
            } catch {
                return false;
            }
        })()
    );

}


/* -----------------------------------------------------------
   F6 — single lifecycle event per utterance.
----------------------------------------------------------- */

async function testSingleLifecycleEvents() {

    const voice = new Voice();

    await settle(5);

    const startCount = countEmissions("voice:speak:start");
    const endCount = countEmissions("voice:speak:end");

    const before = spoken.length;

    voice.speak("Assalam o Alaikum. Sab kuch theek hai.");

    await settle(60);

    const started = await startCount;
    const ended = await endCount;

    assert(
        "F6 one voice:speak:start per chunk",
        started === 2
    );

    assert(
        "F6 one voice:speak:end per chunk",
        ended === 2
    );

    assert(
        "F6 exactly two utterances were created",
        spoken.length - before === 2
    );

    assert(
        "F6 queue drained after speaking",
        voice.queue.size() === 0 &&
        voice.queue.playing === false
    );

}


/* -----------------------------------------------------------
   F7 — synchronous speak() failure recovers the queue.
----------------------------------------------------------- */

async function testSpeakThrowRecoversQueue() {

    speakImpl = () => { throw new Error("speech synthesis down"); };

    const voice = new Voice();

    let errors = 0;

    const handler = () => { errors++; };

    Events.on("voice:speak:error", handler);

    await settle(5);

    voice.speak("First sentence. Second sentence.");

    await settle(60);

    assert(
        "F7 every failed chunk reported as speech error",
        errors === 2
    );

    assert(
        "F7 queue advanced past failures (no stall)",
        voice.queue.size() === 0 &&
        voice.queue.playing === false
    );

    Events.off("voice:speak:error", handler);

    speakImpl = null;

}


async function testPlayerSpeakThrowCallsOnError() {

    const player = new VoicePlayer(
        globalThis.speechSynthesis,
        { rate: 1, pitch: 1, volume: 1 }
    );

    speakImpl = () => { throw new Error("boom failure"); };

    let called = null;

    player.play({
        text: "test",
        onError: error => { called = error; }
    });

    await settle(10);

    assert(
        "F7 player reports synchronous speak failure via onError",
        called && called.message === "boom failure"
    );

    speakImpl = null;

}


/* -----------------------------------------------------------
   F7 (unit) — generic (non-browser) player fallback also
   emits once through Events when no onError is supplied.
----------------------------------------------------------- */

async function testPlayerSpeakThrowEmitsEvent() {

    const player = new VoicePlayer(
        globalThis.speechSynthesis,
        { rate: 1, pitch: 1, volume: 1 }
    );

    speakImpl = () => { throw new Error("raw failure"); };

    const count = countEmissions("voice:speak:error");

    player.play({ text: "test", onStart: () => {}, onEnd: () => {} });

    const n = await count;

    assert(
        "F7 player fallback emits voice:speak:error when no onError",
        n === 1
    );

    speakImpl = null;

}


testRomanUrduDetection();

await testSingleLifecycleEvents();

await testSpeakThrowRecoversQueue();

await testPlayerSpeakThrowCallsOnError();

await testPlayerSpeakThrowEmitsEvent();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}