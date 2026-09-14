import assert from "node:assert";


import Events from "../js/events.js";

import {
    VoiceInput,
    mergeTranscript,
    friendlyError
} from "../js/voice-input.js";


/* Fake browser SpeechRecognition for tests. */

class FakeRecognition {

    static instances = 0;

    constructor() {

        FakeRecognition.instances += 1;

        this.lang = null;

        this.continuous = null;

        this.interimResults = null;

        this.onstart = null;

        this.onresult = null;

        this.onerror = null;

        this.onend = null;

        this.startCount = 0;

        this.stopCount = 0;

    }

    start() {

        this.startCount += 1;

    }

    stop() {

        this.stopCount += 1;

    }

}



function listen(event, log) {

    Events.on(event, (...args) => {

        log.push({ event, args });

    });

}


function capture(event) {

    const log = [];

    listen(event, log);

    return log;

}


/* Deterministic initial state before any test runs. */

FakeRecognition.instances = 0;


/* 1. Detection: exposed SpeechRecognition. */

{

    const vi = new VoiceInput({ SpeechRecognition: FakeRecognition });

    assert.strictEqual(vi.supported, true);

}


/* 2. Detection: webkit padded fallback. */

{

    const vi = new VoiceInput({
        windowRef: { webkitSpeechRecognition: FakeRecognition }
    });

    assert.strictEqual(vi.supported, true);

}


/* 3. Unsupported browser. */

{

    const vi = new VoiceInput({ windowRef: {} });

    assert.strictEqual(vi.supported, false);

    assert.strictEqual(vi.initialize({ language: "en-US" }), false);

    assert.strictEqual(vi.start(), false);

    assert.strictEqual(vi.isListening, false);

    assert.strictEqual(vi.destroy(), undefined);

}


/* 4. Initialize creates one instance with language + options. */

{

    const errors = capture("voice-input:error");

    const vi = new VoiceInput({ SpeechRecognition: FakeRecognition });

    const before = FakeRecognition.instances;

    const ok = vi.initialize({ language: "ur-PK" });

    assert.strictEqual(ok, true);

    assert.strictEqual(FakeRecognition.instances, before + 1);

    const rec = vi._recognition;

    assert.strictEqual(rec.lang, "ur-PK");

    assert.strictEqual(rec.continuous, false);

    assert.strictEqual(rec.interimResults, true);

    /* Second initialize does nothing (single instance). */

    const beforeAgain = FakeRecognition.instances;

    vi.initialize({ language: "en-US" });

    assert.strictEqual(FakeRecognition.instances, beforeAgain);

    assert.strictEqual(rec.lang, "ur-PK");

    assert.strictEqual(errors.length, 0);

}


/* 5. navigator.language fallback. */

{
    const prev = navigator.language;

    Object.defineProperty(globalThis, "navigator", {
        value: { language: "de-DE" },
        configurable: true
    });

    try {

        const vi = new VoiceInput({ SpeechRecognition: FakeRecognition });

        vi.initialize();

        assert.strictEqual(vi._recognition.lang, "de-DE");

    } finally {

        Object.defineProperty(globalThis, "navigator", {
            value: { language: prev },
            configurable: true
        });

    }

}


/* 6. start/hold/stop state cycle + toggle. */

{

    const startLog = capture("voice-input:start");

    const endLog = capture("voice-input:end");

    const vi = new VoiceInput({ SpeechRecognition: FakeRecognition });

    vi.initialize({ language: "en-US" });

    const rec = vi._recognition;

    assert.strictEqual(vi.start(), true);

    assert.strictEqual(rec.startCount, 1);

    assert.strictEqual(vi.isListening, false);

    rec.onstart();

    assert.strictEqual(vi.isListening, true);

    assert.strictEqual(startLog.length, 1);

    /* While listening, toggle stops. */

    assert.strictEqual(vi.toggle(), false);

    assert.strictEqual(rec.stopCount, 1);

    /* Recognition end resets state + emits end. */

    rec.onend();

    assert.strictEqual(vi.isListening, false);

    assert.strictEqual(endLog.length, 1);

    /* Restart works after end. */

    assert.strictEqual(vi.start(), true);

    assert.strictEqual(rec.startCount, 2);

}


/* 7. Duplicate start guard (before onstart fires). */

{

    const errors = capture("voice-input:error");

    const vi = new VoiceInput({ SpeechRecognition: FakeRecognition });

    vi.initialize({ language: "en-US" });

    const rec = vi._recognition;

    assert.strictEqual(vi.start(), true);

    assert.strictEqual(vi.start(), false);

    assert.strictEqual(rec.startCount, 1);

    assert.strictEqual(errors.length, 0);

}


/* 8. Stop before recognition ends still emits end on onend. */

{

    const endLog = capture("voice-input:end");

    const vi = new VoiceInput({ SpeechRecognition: FakeRecognition });

    vi.initialize({ language: "en-US" });

    const rec = vi._recognition;

    vi.start();

    rec.onstart();

    vi.stop();

    assert.strictEqual(vi.isListening, true);

    rec.onend();

    assert.strictEqual(vi.isListening, false);

    assert.strictEqual(endLog.length, 1);

}


/* 9. Transcript emitted, duplicates suppressed. */

{

    const textLog = capture("voice-input:text");

    const vi = new VoiceInput({ SpeechRecognition: FakeRecognition });

    vi.initialize({ language: "en-US" });

    const rec = vi._recognition;

    vi.start();

    rec.onstart();

    rec.onresult({
        resultIndex: 0,
        results: [
            { 0: { transcript: "hello" } }
        ]
    });

    /* Same content again must be ignored. */

    rec.onresult({
        resultIndex: 0,
        results: [
            { 0: { transcript: "hello" } }
        ]
    });

    /* New longer content is emitted. */

    rec.onresult({
        resultIndex: 0,
        results: [
            { 0: { transcript: "hello world" } }
        ]
    });

    assert.deepStrictEqual(
        textLog.map(entry => entry.args[0]),
        ["hello", "hello world"]
    );

    /* Empty transcript ignored. */

    rec.onresult({ resultIndex: 0, results: [] });

    assert.strictEqual(textLog.length, 2);

    /* Missing event object is ignored (no crash). */

    rec.onresult(null);

    rec.onresult(undefined);

    assert.strictEqual(textLog.length, 2);

}


/* 10. Error emits friendly message and resets listening state. */

{

    const errors = capture("voice-input:error");

    const vi = new VoiceInput({ SpeechRecognition: FakeRecognition });

    vi.initialize({ language: "en-US" });

    const rec = vi._recognition;

    vi.start();

    rec.onstart();

    assert.strictEqual(vi.isListening, true);

    rec.onerror({ error: "not-allowed" });

    assert.strictEqual(vi.isListening, false);

    assert.strictEqual(errors.length, 1);

    assert.strictEqual(
        errors[0].args[0],
        "Microphone permission was denied."
    );

}


/* 11. friendlyError never leaks raw codes. */

{

    assert.strictEqual(
        friendlyError({ error: "audio-capture" }),
        "No microphone was found."
    );

    assert.strictEqual(
        friendlyError({ error: "no-speech" }),
        "No speech was detected."
    );

    assert.strictEqual(
        friendlyError({ error: "network" }),
        "Speech recognition is unavailable right now."
    );

    assert.strictEqual(
        friendlyError({ error: "unknown-code" }),
        "Speech recognition could not complete."
    );

    assert.strictEqual(
        friendlyError("garbage"),
        "Speech recognition could not complete."
    );

    assert.strictEqual(
        friendlyError(null),
        "Speech recognition could not complete."
    );

}


/* 12. friendlyError uppercases raw codes. */

{

    assert.strictEqual(
        friendlyError({ error: "NOT-ALLOWED-ERROR" }),
        "Microphone permission was denied."
    );

}


/* 13. mergeTranscript core. */

{

    assert.strictEqual(mergeTranscript("", "hello"), "hello");

    assert.strictEqual(
        mergeTranscript("Hello", "world"),
        "Hello world"
    );

    assert.strictEqual(
        mergeTranscript("Hello ", "world"),
        "Hello world"
    );

    assert.strictEqual(
        mergeTranscript("Typed text.", "spoken"),
        "Typed text. spoken"
    );

    assert.strictEqual(
        mergeTranscript("Hello", "Hello"),
        "Hello"
    );

    assert.strictEqual(
        mergeTranscript("Hi there", "there"),
        "Hi there"
    );

    assert.strictEqual(mergeTranscript(null, "x"), "x");

    assert.strictEqual(mergeTranscript("x", null), "x");

    assert.strictEqual(mergeTranscript("x", ""), "x");

    assert.strictEqual(mergeTranscript("x", "   "), "x");

}


/* 14. Transcript text is plain text, never HTML. */

{

    const raw = "<img src=x onerror=alert(1)>";

    const merged = mergeTranscript("safe", raw);

    assert.strictEqual(merged, "safe " + raw);

    assert.strictEqual(typeof merged, "string");

}


/* 15. No innerHTML in the module (UI sets .value, not HTML). */

{

    const fs = await import("node:fs");

    const source = fs.readFileSync(
        new URL("../js/voice-input.js", import.meta.url),
        "utf8"
    );

    assert.ok(
        !source.includes("innerHTML"),
        "voice-input.js must never use innerHTML"
    );

    /* The UI insert helper must assign .value and never innerHTML. */

    const sourceUI = fs.readFileSync(
        new URL("../js/ui.js", import.meta.url),
        "utf8"
    );

    const markerOpen = "insertVoiceText(text){";

    const markerClose = "insertVoiceText: indexing";

    const start = sourceUI.indexOf(markerOpen);

    assert.ok(start !== -1, "insertVoiceText exists in ui.js");

    const nextMethod =
        sourceUI.indexOf("SENDING STATE", start);

    const end =
        (nextMethod === -1)
            ? sourceUI.length
            : nextMethod;

    const method = sourceUI.slice(start, end);

    assert.ok(
        method.includes(".value"),
        "insertVoiceText assigns input.value"
    );

    assert.ok(
        method.includes("mergeTranscript"),
        "insertVoiceText uses mergeTranscript"
    );

    assert.ok(
        !method.includes("innerHTML"),
        "insertVoiceText must not use innerHTML"
    );

}


/* 16. destroy tears listeners down. */

{

    const vi = new VoiceInput({ SpeechRecognition: FakeRecognition });

    vi.initialize({ language: "en-US" });

    const rec = vi._recognition;

    vi.destroy();

    assert.strictEqual(rec.onstart, null);

    assert.strictEqual(rec.onresult, null);

    assert.strictEqual(rec.onerror, null);

    assert.strictEqual(rec.onend, null);

    assert.strictEqual(vi._recognition, null);

    assert.strictEqual(vi.isListening, false);

    assert.strictEqual(vi.destroy(), undefined);

}


/* 17. Init / start failure paths (constructor throws). */

{

    class ThrowingRecognition {

        constructor() {

            throw new Error("engine broken");

        }

        start() {}

        stop() {}

    }

    const errors = capture("voice-input:error");

    const vi = new VoiceInput({ SpeechRecognition: ThrowingRecognition });

    assert.strictEqual(vi.supported, true);

    const ok = vi.initialize({ language: "en-US" });

    assert.strictEqual(ok, false);

    assert.strictEqual(vi.supported, false);

    assert.strictEqual(vi.start(), false);

    assert.strictEqual(errors.length, 1);

}


/* done */

console.log("Voice Input: all tests passed.");