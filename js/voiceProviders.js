/* ===========================================================
   AI CHAT
   File : voiceProviders.js
   Description : Voice Providers Manager
=========================================================== */

import Events from "./events.js";

export class VoiceProviders {

    constructor(){

        this.voiceCache = {};

    this.provider = "browser";

    this.providers = [

        "browser",

        "google",

        "azure",

        "elevenlabs",

        "openai"

    ];

    /* Providers that are selectable in the UI but have no
       connected backend. Selecting one must NOT become the
       active provider — the safe default (browser TTS) stays
       active and a voice:provider:unavailable event is emitted. */

    this.unavailableProviders = [

        "google",

        "azure",

        "elevenlabs",

        "openai"

    ];

    console.log(
        "Voice Providers Created"
    );

}

    /* =======================================================
       SET PROVIDER
    ======================================================= */

  setProvider(name){

    /* Unavailable providers (google/azure/elevenlabs/openai) must
       never become the active provider, even if a call site tries
       to restore one from previously persisted settings. */
    if(this.isUnavailable(name)){

        console.warn(
            "Voice provider unavailable:",
            name,
            "— keeping browser as the active provider."
        );

        Events.emit(
            "voice:provider:unavailable",
            {
                name,
                fallbackTo: "browser"
            }
        );

        return false;

    }

    if(this.hasProvider(name)){

        this.provider = name;

        console.log(
            "Voice Provider:",
            name
        );

        return true;

    }
    else{

        console.warn(
            "Unknown provider:",
            name
        );

        return false;

    }

}

    /* =======================================================
       GET PROVIDER
    ======================================================= */

    getProvider() {

        return this.provider;

    }

    /* =======================================================
       IS UNAVAILABLE
       A stub provider (google / azure / elevenlabs / openai)
       has no connected backend yet. It must never become the
       active provider.
    ======================================================= */

    isUnavailable(name) {

        return this.unavailableProviders.includes(name);

    }

    /* =======================================================
       SPEAK
    ======================================================= */

    async speak(options) {

        /* Defensive safety net: if an unavailable provider
           somehow exists as the active provider (e.g. from an
           old persisted state), it must not silently fall back
           to browser TTS or crash. Reset it to browser and
           surface the event instead. */
        if (
            this.isUnavailable(
                this.provider
            )
        ) {

            console.warn(
                "Rejecting unavailable provider:",
                this.provider
            );

            Events.emit(
                "voice:provider:unavailable",
                {
                    name: this.provider,
                    fallbackTo: "browser"
                }
            );

            this.provider = "browser";

        }

        switch(this.provider){

            case "browser":

                return this.browser(options);

            case "google":

                return this.google(options);

            case "azure":

                return this.azure(options);

            case "elevenlabs":

                return this.elevenLabs(options);

            case "openai":

                return this.openAI(options);

            default:

                return this.browser(options);

        }

    }

    /* =======================================================
       BROWSER TTS
    ======================================================= */

   browser(options){

    if(!options){

        return;

    }

    if(
        !options.player ||
        typeof options.player.play !== "function"
    ){

        console.error(
            "Voice Player not available."
        );

        return;

    }

    return options.player.play(options);

}

    /* =======================================================
       GOOGLE TTS
    ======================================================= */
    async google(options){

        console.warn(
            "Google TTS not connected."
        );

        /* No silent fallback: an unavailable provider must never
           play through the browser player behind the scenes. */
        return false;

    }

    /* =======================================================
       AZURE TTS
    ======================================================= */

    async azure(options){

        console.warn(
            "Azure TTS not connected."
        );

        /* No silent fallback: an unavailable provider must never
           play through the browser player behind the scenes. */
        return false;

    }

    /* =======================================================
       ELEVENLABS
    ======================================================= */

    async elevenLabs(options){

        console.warn(
            "ElevenLabs TTS not connected."
        );

        /* No silent fallback: an unavailable provider must never
           play through the browser player behind the scenes. */
        return false;

    }

    /* =======================================================
       OPENAI TTS
    ======================================================= */

    async openAI(options){

        console.warn(
            "OpenAI TTS not connected."
        );

        /* No silent fallback: an unavailable provider must never
           play through the browser player behind the scenes. */
        return false;

    }

    /* =======================================================
   GET BEST VOICE
======================================================= */
getVoice(info, voices){

    const cacheKey = info.language;

    if(this.voiceCache[cacheKey]){

        return this.voiceCache[cacheKey];

    }

    if(!voices || !voices.length){

        return null;

    }

    let selectedVoice = null;

    switch(info.language){

        case "urdu":

selectedVoice =

voices.find(
v =>
v.lang === "ur-PK" &&
v.name.includes("network")
)

||

voices.find(
v =>
v.lang === "ur-PK" &&
v.name.includes("local")
)

||

voices.find(
v =>
v.lang === "ur-PK"
)

||

voices.find(
v =>
v.lang.startsWith("ur")
);

break;

        case "hindi":

            selectedVoice =

                voices.find(
                    v => v.lang === "hi-IN"
                )

                ||

                voices.find(
                    v => v.lang.startsWith("hi")
                );

            break;

        case "roman-urdu":

    selectedVoice =

        voices.find(
            v =>
            v.lang === "ur-PK" &&
            v.localService === true
        )

        ||

        voices.find(
            v =>
            v.lang.startsWith("ur") &&
            v.localService === true
        )

        ||

        voices.find(
            v =>
            v.lang === "ur-PK"
        );

    break;
        case "english":

            selectedVoice =

                voices.find(
                    v => !v.localService &&
                    v.lang.startsWith("en")
                )

                ||

                voices.find(
                    v => v.default &&
                    v.lang.startsWith("en")
                )

                ||

                voices.find(
                    v => v.lang === "en-US"
                )

                ||

                voices.find(
                    v => v.lang.startsWith("en")
                );

            break;

        default:

            selectedVoice = voices[0];

    }

    this.voiceCache[cacheKey] = selectedVoice;

    return selectedVoice;

}

/* =======================================================
   HAS PROVIDER
======================================================= */

hasProvider(name){

    return this.providers.includes(name);

}

/* =======================================================
   AVAILABLE PROVIDERS
======================================================= */
getAvailableProviders(){

    return [...this.providers];

}


}