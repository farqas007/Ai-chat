/* ===========================================================
   AI CHAT
   File : voice.js
   Description : Voice Manager
=========================================================== */


import Events from "./events.js";
import { UrduToRoman } from "./urduToRoman.js";
import { VoiceQueue } from "./voiceQueue.js";
import { VoicePlayer } from "./voicePlayer.js";
import { VoiceProviders } from "./voiceProviders.js";
import { StreamVoice } from "./streamVoice.js";
import {
    VoiceSettings,
    resolveRecognitionLanguage,
    normalizeVoiceSettings
} from "./voiceSettings.js";
import { VoiceCommands } from "./voiceCommands.js";
import { LanguageDetector } from "./languageDetector.js";


/* ===========================================================
   VOICE MANAGER
=========================================================== */


export class Voice {


    constructor() {

    /* ==========================================
       Browser Speech
    ========================================== */

    this.synthesis = window.speechSynthesis;

    this.voices = [];


    /* ==========================================
       State
    ========================================== */

    this.state = {

        speaking: false

    };


    /* ==========================================
       Settings
    ========================================== */

this.settings = {

    language: "auto",

    voiceLabel: "",

    rate: 0.92,

    pitch: 1,

    volume: 1

};


    /* ==========================================
       Modules
    ========================================== */

    this.config = new VoiceSettings();

    this.detector = new LanguageDetector();

    this.urduConverter = new UrduToRoman();

    this.queue = new VoiceQueue();

    this.player = new VoicePlayer(

        this.synthesis,

        this.settings

    );

    this.providers = new VoiceProviders();

    this.stream = new StreamVoice(

        this.queue

    );

    this.commands = new VoiceCommands();


    console.log(

        "Voice Manager Created"

    );

}




    /* =======================================================
   INITIALIZE
======================================================= */

initialize() {

    console.log("Initializing Voice Manager...");

    // Load browser voices
    this.loadVoices();

    // Load saved settings
    if (this.config) {

        this.settings = normalizeVoiceSettings({

            ...this.settings,

            ...this.config.load()

        });

    }

    // The player must use the CURRENT settings object, not the
    // original literal captured in the constructor.
    this.syncPlayerSettings();

    // Apply the persisted provider so the active voice provider
    // always matches saved settings. Unavailable providers are
    // rejected by VoiceProviders (B3) and browser stays active.
    this.applyProvider(this.settings.provider);

    // Keep settings (and the player binding) in sync when the
    // voice settings UI saves changes.
    Events.on(

        "voice:settings:changed",

        settings => {

            this.settings = normalizeVoiceSettings({

                ...this.settings,

                ...settings

            });

            this.syncPlayerSettings();

            // Route the saved selection into the active provider
            // (BUG-1: previously the provider choice was inert).
            this.applyProvider(this.settings.provider);

        }

    );

    console.log("Voice Initialized");

}

    /* =======================================================
       SYNC PLAYER SETTINGS
    ======================================================= */

syncPlayerSettings() {

    if (this.player) {

        this.player.settings = this.settings;

    }

}

    /* =======================================================
       APPLY PROVIDER
       Keeps the active VoiceProviders instance in sync with the
       persisted provider setting. VoiceProviders.setProvider()
       (B3) rejects unavailable providers, emits
       voice:provider:unavailable and keeps "browser" active.
       When a selection is rejected, the persisted settings are
       written back to the active provider so provider state and
       saved settings never drift apart.
    ======================================================= */

    applyProvider(name) {

        if (
            !this.providers ||
            typeof this.providers.setProvider !== "function"
        ) {

            return false;

        }

        if (typeof name !== "string" || name === "") {

            return false;

        }

        const accepted =
            this.providers.setProvider(name) === true;

        if (
            !accepted &&
            typeof this.providers.isUnavailable === "function" &&
            this.providers.isUnavailable(name)
        ) {

            const fallback = "browser";

            this.settings = {

                ...this.settings,

                provider: fallback

            };

            if (this.config && typeof this.config.set === "function") {

                this.config.set("provider", fallback);

                if (typeof this.config.save === "function") {

                    this.config.save();

                }

            }

        }

        return accepted;

    }

/* =======================================================
   LOAD VOICES
======================================================= */

loadVoices() {

    const load = () => {

        this.voices = this.synthesis.getVoices();

        console.log(

            "Voices Loaded:",

            this.voices.length

        );

    };

    load();

    this.synthesis.onvoiceschanged = load;

}

/* =======================================================
   TEXT TO SPEECH
======================================================= */

speak(text) {

    if (!this.synthesis || !text) {
        return;
    }


    // Ensure text is string
    if (typeof text !== "string") {

        text = String(text);

    }


    // Split long sentences
    const chunks =
        text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
        || [text];


    chunks.forEach(chunk => {

        this.queue.add(
            chunk.trim()
        );

    });


    if (this.queue.playing) {

        return;

    }


    this.playQueue();

}
    /* =======================================================
       STOP SPEAKING
    ======================================================= */


  stopSpeaking(){

    if(!this.synthesis){

        return;

    }

    this.synthesis.cancel();

    this.state.speaking = false;

    this.queue.clear();

    this.queue.playing = false;

    console.log("Speech stopped");

}



    /* =======================================================
       SETTINGS
    ======================================================= */

setSettings(options){


        this.settings = normalizeVoiceSettings({


            ...this.settings,


            ...options


        });

        this.syncPlayerSettings();


    }

    /* =======================================================
       GET RECOGNITION LANGUAGE
       Returns a valid BCP-47 tag for SpeechRecognition.lang.
       An explicitly stored recognitionLanguage (persisted by the
       voice settings UI) wins; otherwise the recognition tag is
       derived from the style "language" setting. Runtime TTS
       voice labels never flow into the recognition engine.
    ======================================================= */

    getRecognitionLanguage() {

        if (
            !this.settings ||
            typeof this.settings !== "object"
        ) {

            return "ur-PK";

        }

        const stored = this.settings.recognitionLanguage;

        if (
            typeof stored === "string" &&
            stored.trim() !== ""
        ) {

            return resolveRecognitionLanguage(stored);

        }

        return resolveRecognitionLanguage(

            this.settings.language || "auto"

        );

    }

    /* =======================================================
       STATUS
    ======================================================= */


    getState(){


        return {


            ...this.state


        };


    }


    /* =======================================================
   PLAY QUEUE
======================================================= */

playQueue(){

    if(!this.queue.hasItems()){

        this.queue.playing = false;

        return;

    }

    this.queue.playing = true;

    const text = this.queue.next();

    this.playSpeech(text);

}


/* =======================================================
   PLAY SPEECH
======================================================= */

playSpeech(text) {

    if (!text) {

        this.queue.playing = false;

        return;

    }

    /* ==============================================
       Clean HTML
    ============================================== */

    text = text
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();

    if (!text) {

        this.queue.playing = false;

        return;

    }

    /* ==============================================
       Detect Language
    ============================================== */

    let info = this.detector.detect(text);


// Roman Urdu detection priority
if(this.isRomanUrdu(text)){

    info = {

        language:"roman-urdu",

        voiceLanguage:"ur-PK"

    };

}


console.log(
    "Final Voice Language:",
    info
);

    console.log(
        "Language Detected:",
        info
    );

    /* ==============================================
       Urdu → Roman Fallback
    ============================================== */

    let speakText = text;

    if (
        info.language === "urdu" &&
        this.urduConverter
    ) {

        speakText =
            this.urduConverter.convert(text);

    }

    /* ==============================================
       Available Voices
    ============================================== */

    const voices =
        this.voices.length
            ? this.voices
            : this.synthesis.getVoices();

    /* ==============================================
       Select Voice
    ============================================== */

    const selectedVoice =
        this.providers?.getVoice?.(
            info,
            voices
        ) || null;

    console.log(
        "Selected Voice:",
        selectedVoice?.name,
        info.voiceLanguage
    );



    /* ==============================================
       Play Using Provider
    ============================================== */

    this.providers.speak({

        player: this.player,

        text: speakText,

        voice: selectedVoice,

        lang: info.voiceLanguage,

        onStart: () => {

            this.state.speaking = true;

            console.log(
                "Speech Started"
            );

        },

        onEnd: () => {

            this.state.speaking = false;

            this.queue.playing = false;

            console.log(
                "Speech Finished"
            );

            this.playQueue();

        },

        onError: (error) => {

            console.error(
                "Speech Error:",
                error
            );

            this.state.speaking = false;

            this.queue.playing = false;

            // Continue next queued item
            this.playQueue();

        }

    });

}

    /* =======================================================
       DESTROY
    ======================================================= */


   destroy(){

    this.stopSpeaking();

    this.voices = [];

    this.queue.clear();

    this.state.speaking = false;

    console.log(
        "Voice Destroyed"
    );

}

isRomanUrdu(text){

const words = [

"aap",
"ap",
"hai",
"hain",
"ho",
"hoon",
"kya",
"kaise",
"mujhe",
"aapka",
"mera",
"meri",
"acha",
"theek",
"bilkul",
"nahi",
"haan",
"kyun"

];


// Word-boundary match: substring hits such as "hai" inside
// "shair" or "kyun" inside "skunked" must not count.
const pattern =

new RegExp(

`\\b(?:${words.join("|")})\\b`,

"gi"

);


const matches =

typeof text === "string"

? text.match(pattern) || []

: [];


return matches.length >= 2;

}

}