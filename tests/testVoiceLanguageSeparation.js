/* ===========================================================
   PH-01 regression: the voice "language" setting no longer
   collides with the recognition language.

   Previously one settings.language held three different value
   shapes at once:
     - the Settings-modal TTS voice label ("Google US English
       (en-US)"),
     - the VoiceUI style value (auto/english/urdu/roman),
     - a default BCP-47 tag ("ur-PK"),
   and every one of them flowed straight into
   SpeechRecognition.lang, which only accepts valid BCP-47 tags.

   The split:
     - settings.language  = VoiceUI STYLE (auto/english/urdu/roman)
     - settings.voiceLabel = Settings-modal TTS voice picker label
     - settings.recognitionLanguage = valid BCP-47 for recognition
   =========================================================== */

globalThis.window = globalThis;

const recognitionInstances = [];

globalThis.SpeechRecognition = class {
    constructor() {
        this.lang = "";
        this.continuous = false;
        this.interimResults = false;
        this.onstart = null;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        recognitionInstances.push(this);
    }
    start() {}
    stop() {}
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
    getVoices: () => [
        { name: "Google US English", lang: "en-US" },
        { name: "Google Urdu", lang: "ur-PK" }
    ],
    speak: () => {},
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    onvoiceschanged: null
};

globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
        className: "", style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, innerHTML: "", textContent: "",
        appendChild() {}, addEventListener() {}, setAttribute() {}, remove() {}, focus() {}, querySelector: () => null
    }),
    addEventListener() {},
    body: { appendChild() {}, style: {} }
};

import { Voice } from "../js/voice.js";
import { VoiceSettings } from "../js/voiceSettings.js";
import {
    resolveRecognitionLanguage,
    normalizeVoiceSettings
} from "../js/voiceSettings.js";
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

function clearInstances() {
    localStorage.clear();
    recognitionInstances.length = 0;
}

function makeVoice(persisted = {}) {
    const settings = new VoiceSettings();
    settings.update(persisted);
    settings.save();
    const voice = new Voice();
    voice.initialize();
    return voice;
}


/* -----------------------------------------------------------
   R1 — resolveRecognitionLanguage maps every input shape to a
   valid BCP-47 tag.
----------------------------------------------------------- */

function testResolver() {

    assert(
        "R1 auto -> default ur-PK",
        resolveRecognitionLanguage("auto") === "ur-PK"
    );

    assert(
        "R1 english -> en-US",
        resolveRecognitionLanguage("english") === "en-US"
    );

    assert(
        "R1 urdu -> ur-PK",
        resolveRecognitionLanguage("urdu") === "ur-PK"
    );

    assert(
        "R1 roman -> ur-PK",
        resolveRecognitionLanguage("roman") === "ur-PK"
    );

    assert(
        "R1 full BCP-47 tag passes through",
        resolveRecognitionLanguage("en-US") === "en-US" &&
        resolveRecognitionLanguage("ur-PK") === "ur-PK" &&
        resolveRecognitionLanguage("hi-IN") === "hi-IN"
    );

    assert(
        "R1 lowercased tag preserved (valid BCP-47)",
        resolveRecognitionLanguage("pt-br") === "pt-br"
    );

    assert(
        "R1 TTS voice label never passes through",
        resolveRecognitionLanguage("Google US English (en-US)") === "ur-PK"
    );

    assert(
        "R1 empty string falls back",
        resolveRecognitionLanguage("") === "ur-PK"
    );

    assert(
        "R1 non-string falls back",
        resolveRecognitionLanguage(null) === "ur-PK" &&
        resolveRecognitionLanguage(undefined) === "ur-PK"
    );

    assert(
        "R1 custom fallback honored",
        resolveRecognitionLanguage("auto", "ar-SA") === "ar-SA"
    );

}


/* -----------------------------------------------------------
   R2 — normalizeVoiceSettings moves a legacy voice label out of
   the language field and always yields a valid recognition tag.
----------------------------------------------------------- */

function testNormalize() {

    const legacy = normalizeVoiceSettings({
        language: "Google US English (en-US)"
    });

    assert(
        "R2 legacy label moved to voiceLabel",
        legacy.voiceLabel === "Google US English (en-US)" &&
        legacy.language === "auto"
    );

    assert(
        "R2 legacy label left for safe read-time derivation",
        legacy.language === "auto" &&
        legacy.recognitionLanguage === undefined
    );

    const styled = normalizeVoiceSettings({
        language: "english",
        rate: 1.2
    });

    assert(
        "R2 style language left for read-time derivation",
        styled.language === "english" &&
        styled.recognitionLanguage === undefined
    );

    assert(
        "R2 explicit recognitionLanguage validated + kept",
        normalizeVoiceSettings({
            language: "english",
            recognitionLanguage: "ar-SA"
        }).recognitionLanguage === "ar-SA"
    );

    assert(
        "R2 invalid explicit recognitionLanguage falls back",
        normalizeVoiceSettings({
            language: "english",
            recognitionLanguage: "Google US English (en-US)"
        }).recognitionLanguage === "ur-PK"
    );

    assert(
        "R2 missing voiceLabel filled",
        normalizeVoiceSettings({ language: "auto" }).voiceLabel === ""
    );

    assert(
        "R2 empty language normalized to auto",
        normalizeVoiceSettings({ language: "" }).language === "auto"
    );

}


/* -----------------------------------------------------------
   R3 — Voice recognition.lang is always a valid BCP-47 tag, and
   is never clobbered by the TTS voice label.
----------------------------------------------------------- */

function testRecognitionNeverClobbered() {

    clearInstances();

    // Persist the English style through the voice UI pipeline.
    const voice = makeVoice({ language: "english" });

    assert(
        "R3 recognition.lang = en-US for english style",
        voice.recognition.lang === "en-US"
    );

    assert(
        "R3 getRecognitionLanguage returns en-US",
        voice.getRecognitionLanguage() === "en-US"
    );

    assert(
        "R3 style language retained",
        voice.settings.language === "english"
    );

    // The Settings-modal TTS voice picker selects a voice label.
    voice.setSettings({ voiceLabel: "Google Urdu (ur-PK)" });

    assert(
        "R3 voice label stored separately",
        voice.settings.voiceLabel === "Google Urdu (ur-PK)"
    );

    assert(
        "R3 voice label did NOT overwrite recognition.lang",
        voice.recognition.lang === "en-US"
    );

    assert(
        "R3 voice label did NOT overwrite style language",
        voice.settings.language === "english"
    );

}


/* -----------------------------------------------------------
   R4 — the voice:settings:changed (VoiceUI save) path keeps the
   recognition engine in sync with the saved style.
----------------------------------------------------------- */

function testSettingsChangedPath() {

    clearInstances();

    const voice = makeVoice({}); // default auto

    assert(
        "R4 default auto resolves to ur-PK",
        voice.getRecognitionLanguage() === "ur-PK" &&
        voice.recognition.lang === "ur-PK"
    );

    // Emulate VoiceUI.save() emitting an english style selection.
    Events.emit("voice:settings:changed", {
        provider: "browser",
        language: "english",
        recognitionLanguage: "en-US"
    });

    assert(
        "R4 save path updates recognition.lang to en-US",
        voice.recognition.lang === "en-US"
    );

    assert(
        "R4 save path retains style language",
        voice.settings.language === "english"
    );

    Events.emit("voice:settings:changed", {
        language: "urdu",
        recognitionLanguage: "ur-PK"
    });

    assert(
        "R4 save path follows to urdu -> ur-PK",
        voice.recognition.lang === "ur-PK"
    );

}


/* -----------------------------------------------------------
   R5 — setSettings({ language }) (a style value) still updates
   the recognition engine as expected; a value that is NOT a
   style still never becomes an invalid SpeechRecognition tag.
----------------------------------------------------------- */

function testSetSettingsLanguage() {

    clearInstances();

    const voice = makeVoice({});

    voice.setSettings({ language: "roman" });

    assert(
        "R5 roman style -> recognition ur-PK",
        voice.recognition.lang === "ur-PK"
    );

    voice.setSettings({ language: "english" });

    assert(
        "R5 english style -> recognition en-US",
        voice.recognition.lang === "en-US"
    );

    // Defensive: a label-shaped value written to "language" is
    // routed to voiceLabel and never becomes an invalid
    // SpeechRecognition tag.
    voice.setSettings({ language: "Microsoft Zira (en-CA)" });

    assert(
        "R5 label-shaped value neutralized into a valid tag",
        voice.recognition.lang === "ur-PK" &&
        voice.settings.voiceLabel === "Microsoft Zira (en-CA)"
    );

}


testResolver();

testNormalize();

testRecognitionNeverClobbered();

testSettingsChangedPath();

testSetSettingsLanguage();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}