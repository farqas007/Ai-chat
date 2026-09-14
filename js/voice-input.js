/* ===========================================================
   AI CHAT
   File : voice-input.js
   Description : Chat composer voice input (SpeechRecognition wrapper)
   =========================================================== */

import Events from "./events.js";


/* ===========================================================
   FRIENDLY ERROR MESSAGES
   Raw browser error codes are never shown to the user.
=========================================================== */

const FRIENDLY_ERRORS = {

    "not-allowed": "Microphone permission was denied.",

    "service-not-allowed": "Microphone permission was denied.",

    "not-allowed-error": "Microphone permission was denied.",

    "audio-capture": "No microphone was found.",

    "no-speech": "No speech was detected.",

    "network": "Speech recognition is unavailable right now.",

    "aborted": "Speech recognition was stopped."

};


export function friendlyError(error) {

    const code =
        (error && typeof error === "object" && error.error)
            ? String(error.error)
            : String(error || "");

    return FRIENDLY_ERRORS[code.toLowerCase()] ||
        "Speech recognition could not complete.";
}


/* ===========================================================
   MERGE TRANSCRIPT
   Pure helper: integrates a voice transcript into existing
   composer text without deleting it and without duplicates.
=========================================================== */

export function mergeTranscript(existingValue, transcript) {

    const current =
        String(existingValue == null ? "" : existingValue);

    const incoming =
        String(transcript == null ? "" : transcript);

    if (incoming.trim() === "") {

        return current;
    }

    if (current.trim() === "") {

        return incoming;
    }

    if (current.includes(incoming.trim())) {

        return current;
    }

    return current.replace(/\s+$/, "") + " " + incoming.trim();
}


/* ===========================================================
   VOICE INPUT
=========================================================== */

export class VoiceInput {

    constructor(options = {}) {

        const windowRef =
            (options.windowRef && typeof options.windowRef === "object")
                ? options.windowRef
                : (typeof window !== "undefined" ? window : null);

        const Constructor =
            options.SpeechRecognition ||
            (windowRef &&
                (windowRef.SpeechRecognition ||
                    windowRef.webkitSpeechRecognition));

        this._recognition = null;

        this._initialized = false;

        this._listening = false;

        this._started = false;

        this._lastTranscript = "";

        this.supported = typeof Constructor === "function";

        if (this.supported) {

            this.Constructor = Constructor;

        }

    }


    get isListening() {

        return this._listening;

    }


    /* =======================================================
       INITIALIZE (creates the single recognition instance)
    ======================================================= */

    initialize({ language } = {}) {

        if (!this.supported || this._initialized) {

            return false;

        }

        const lang =
            (typeof language === "string" && language)
                ? language
                : (typeof navigator !== "undefined" && navigator.language)
                    ? navigator.language
                    : "en-US";

        let recognition;

        try {

            recognition = new this.Constructor();

        } catch (error) {

            this.supported = false;

            Events.emit(
                "voice-input:error",
                "Speech recognition could not be initialized."
            );

            return false;

        }

        recognition.lang = lang;

        recognition.continuous = false;

        recognition.interimResults = true;

        recognition.onstart = () => {

            this._listening = true;

            Events.emit("voice-input:start");

        };

        recognition.onresult = event => {

            this._handleResult(event);

        };

        recognition.onerror = error => {

            this._listening = false;

            this._started = false;

            Events.emit(
                "voice-input:error",
                friendlyError(error)
            );

        };

        recognition.onend = () => {

            this._finish();

        };

        this._recognition = recognition;

        this._initialized = true;

        return true;

    }


    /* =======================================================
       HANDLE RESULTS
       Emits only changed transcripts to avoid duplicate text.
    ======================================================= */

    _handleResult(event) {

        const results =
            (event && event.results) || [];

        let text = "";

        const startIndex =
            (event && typeof event.resultIndex === "number")
                ? event.resultIndex
                : 0;

        for (let i = startIndex; i < results.length; i++) {

            const row = results[i];

            if (row && row[0] && typeof row[0].transcript === "string") {

                text += row[0].transcript;

            }

        }

        if (text.trim() === "") {

            return;

        }

        if (text === this._lastTranscript) {

            return;

        }

        this._lastTranscript = text;

        Events.emit("voice-input:text", text);

    }


    /* =======================================================
       START / STOP
    ======================================================= */

    start() {

        if (
            !this.supported ||
            !this._recognition ||
            this._started ||
            this._listening
        ) {

            return false;

        }

        this._started = true;

        this._lastTranscript = "";

        try {

            this._recognition.start();

        } catch (error) {

            this._started = false;

            Events.emit(
                "voice-input:error",
                "Speech recognition could not start."
            );

            return false;

        }

        return true;

    }


    stop() {

        if (!this._recognition) {

            return;

        }

        try {

            this._recognition.stop();

        } catch (error) {

            // Ignore stop errors; onend still resets the state.
        }

    }


    toggle() {

        if (this._listening || this._started) {

            this.stop();

            return false;

        }

        return this.start();

    }


    /* =======================================================
       FINISH (shared by onend / destroy)
    ======================================================= */

    _finish() {

        if (!this._listening && !this._started) {

            return;

        }

        this._listening = false;

        this._started = false;

        this._lastTranscript = "";

        Events.emit("voice-input:end");

    }


    /* =======================================================
       DESTROY
    ======================================================= */

    destroy() {

        this.stop();

        if (this._recognition) {

            this._recognition.onstart = null;

            this._recognition.onresult = null;

            this._recognition.onerror = null;

            this._recognition.onend = null;

            this._recognition = null;

        }

        this._initialized = false;

        this._listening = false;

        this._started = false;

        this._lastTranscript = "";

    }

}