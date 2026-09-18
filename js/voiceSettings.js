/* ===========================================================
   AI CHAT
   File : voiceSettings.js
   Description : Voice Settings Manager
=========================================================== */

import { STORAGE_KEYS } from "./storage.js";


/* ===========================================================
   RECOGNITION LANGUAGE RESOLUTION
   Pure helper: maps the style values used by the voice settings
   UI (auto / english / urdu / roman) - or a full BCP-47 tag - to
   a value that is safe to assign to SpeechRecognition.lang.

   SpeechRecognition.lang only accepts valid BCP-47 language tags,
   so anything else (TTS voice labels like "Google US English
   (en-US)", free text, empty values) falls back to the default.
   =========================================================== */

const BARE_TAG_RE = /^[a-zA-Z]{2,3}$/;

const REGION_TAG_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})+$/;

export function resolveRecognitionLanguage(value, fallback = "ur-PK") {

    if (typeof value !== "string") {

        return fallback;

    }

    const cleaned = value.trim();

    if (cleaned === "") {

        return fallback;

    }

    const lower = cleaned.toLowerCase();

    if (lower === "auto") {

        return fallback;

    }

    if (lower === "english") {

        return "en-US";

    }

    if (lower === "urdu" || lower === "roman" || lower === "roman-urdu") {

        return "ur-PK";

    }

    if (BARE_TAG_RE.test(cleaned) || REGION_TAG_RE.test(cleaned)) {

        return cleaned;

    }

    return fallback;

}


/* ===========================================================
   NORMALIZE VOICE SETTINGS
   Pure helper: reconciles a settings object so the recognition
   language and the TTS voice label never collide.

   - A BCP-47 tag (or a TTS label) mistakenly stored in the style
     "language" field is moved to "voiceLabel" and "language" is
     reset to the neutral "auto".
   - An explicitly stored "recognitionLanguage" is kept but always
     validated to a valid SpeechRecognition tag.
   =========================================================== */

const VOICE_LABEL_RE = /^[^()]*\(.+\)$/;

export function normalizeVoiceSettings(settings = {}, fallback = "ur-PK") {

    const result = { ...settings };

    if (typeof result.language !== "string" || result.language === "") {

        result.language = "auto";

    }

    if (typeof result.language === "string" && VOICE_LABEL_RE.test(result.language)) {

        result.voiceLabel = result.language;

        result.language = "auto";

    }

    if (typeof result.voiceLabel !== "string") {

        result.voiceLabel = "";

    }

    if (
        result.recognitionLanguage !== undefined &&
        result.recognitionLanguage !== null &&
        result.recognitionLanguage !== ""
    ) {

        result.recognitionLanguage = resolveRecognitionLanguage(

            result.recognitionLanguage,

            fallback

        );

    }

    return result;

}


export class VoiceSettings {

    constructor() {

        this.settings = {

            /* Language */

            language: "auto",

            autoDetect: true,

            romanFallback: true,

            streaming: true,



            /* Voice */

            provider: "browser",

            voice: "auto",

            englishVoice: "auto",

            urduVoice: "auto",



            /* Audio */

            rate: 1,

            pitch: 1,

            volume: 1,



            /* Queue */

            queue: true,

            interrupt: false,



            /* Recovery */

            retry: true,

            maxRetries: 2,



            /* Debug */

            debug: false

        };

        console.log(
            "Voice Settings Created"
        );

    }

    /* =======================================================
       GET
    ======================================================= */

    get(key) {

        return this.settings[key];

    }

    /* =======================================================
       SET
    ======================================================= */

    set(key, value) {

        this.settings[key] = value;

    }

    /* =======================================================
       UPDATE
    ======================================================= */

    update(options = {}) {

        this.settings = {

            ...this.settings,

            ...options

        };

    }

    /* =======================================================
       ALL
    ======================================================= */

    all() {

        return {

            ...this.settings

        };

    }

    /* =======================================================
       SAVE
    ======================================================= */

    save() {

        localStorage.setItem(

            STORAGE_KEYS.VOICE_SETTINGS,

            JSON.stringify(

                this.settings

            )

        );

    }

    /* =======================================================
       LOAD
    ======================================================= */

    load() {

        const data = localStorage.getItem(

            STORAGE_KEYS.VOICE_SETTINGS

        );

        if (!data) {

            return this.all();

        }

        try {

            this.settings = {

                ...this.settings,

                ...JSON.parse(data)

            };

        }

        catch (error) {

            console.error(

                "Voice Settings Error",

                error

            );

        }

        return this.all();

    }

    /* =======================================================
       RESET
    ======================================================= */

    reset() {

        localStorage.removeItem(

            STORAGE_KEYS.VOICE_SETTINGS

        );

    }

}