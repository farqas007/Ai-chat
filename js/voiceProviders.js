/* ===========================================================
   AI CHAT
   File : voiceProviders.js
   Description : Voice Providers Manager
=========================================================== */

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

    console.log(
        "Voice Providers Created"
    );

}

    /* =======================================================
       SET PROVIDER
    ======================================================= */

  setProvider(name){

    if(this.hasProvider(name)){

        this.provider = name;

        console.log(
            "Voice Provider:",
            name
        );

    }
    else{

        console.warn(
            "Unknown provider:",
            name
        );

    }

}

    /* =======================================================
       GET PROVIDER
    ======================================================= */

    getProvider() {

        return this.provider;

    }

    /* =======================================================
       SPEAK
    ======================================================= */

    async speak(options) {

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

return this.browser(options);

}

    /* =======================================================
       AZURE TTS
    ======================================================= */

    async azure(options){

        console.warn(
            "Azure TTS not connected."
        );

        return this.browser(options);

    }

    /* =======================================================
       ELEVENLABS
    ======================================================= */

    async elevenLabs(options){

        console.warn(
            "ElevenLabs not connected."
        );

        return this.browser(options);

    }

    /* =======================================================
       OPENAI TTS
    ======================================================= */

    async openAI(options){

        console.warn(
            "OpenAI TTS not connected."
        );

        return this.browser(options);

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