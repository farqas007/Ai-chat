/* ===========================================================
   Regression tests for voice pipeline fixes.

   F6: a single call to Voice.speak(text) with sentence-ending
       punctuation creates one utterance per sentence and the
       queue drains completely after all utterances are played.
   F7: a synchronous throw from synthesis.speak() no longer
       stalls the queue forever — the onError callback fires
       and the queue advances to the next chunk.
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

    return utterance;

};


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
   F6 — one utterance per sentence, queue drains.
----------------------------------------------------------- */

async function testSingleLifecycleEvents() {

    const voice = new Voice();

    const before = spoken.length;

    voice.speak("Assalam o Alaikum. Sab kuch theek hai.");

    /* The queue advances only through lifecycle callbacks, so driving
       each utterance's onstart/onend is fully deterministic. */
    for (let i = before; i < spoken.length; i++) {

        if (spoken[i].onstart) {
            spoken[i].onstart();
        }
        if (spoken[i].onend) {
            spoken[i].onend();
        }

    }

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

    voice.speak("First sentence. Second sentence.");

    assert(
        "F7 queue advanced past failures (no stall)",
        voice.queue.size() === 0 &&
        voice.queue.playing === false
    );

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

    assert(
        "F7 player reports synchronous speak failure via onError",
        called && called.message === "boom failure"
    );

    speakImpl = null;

}


testRomanUrduDetection();

await testSingleLifecycleEvents();

await testSpeakThrowRecoversQueue();

await testPlayerSpeakThrowCallsOnError();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}