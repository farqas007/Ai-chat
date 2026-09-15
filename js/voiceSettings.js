/* ===========================================================
   AI CHAT
   File : voiceSettings.js
   Description : Voice Settings Manager
=========================================================== */

import { STORAGE_KEYS } from "./storage.js";


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