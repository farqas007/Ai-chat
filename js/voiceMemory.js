/* ===========================================================
   AI CHAT
   File : voiceMemory.js
   Description : Voice Memory Manager
=========================================================== */

export class VoiceMemory {

    constructor(){

        this.storageKey = "ai-chat-voice-memory";

        this.data = {

            language : "auto",

            voice : "",

            provider : "browser",

            rate : 1,

            pitch : 1,

            volume : 1,

            autoDetect : true,

            stream : true,

            fallback : true

        };

        this.load();

        console.log(
            "Voice Memory Created"
        );

    }

    /* =======================================================
       LOAD
    ======================================================= */

    load(){

        try{

            const saved = localStorage.getItem(
                this.storageKey
            );

            if(saved){

                this.data = {

                    ...this.data,

                    ...JSON.parse(saved)

                };

            }

        }

        catch(error){

            console.warn(
                "Voice Memory Load Failed",
                error
            );

        }

    }

    /* =======================================================
       SAVE
    ======================================================= */

    save(){

        try{

            localStorage.setItem(

                this.storageKey,

                JSON.stringify(
                    this.data
                )

            );

        }

        catch(error){

            console.warn(
                "Voice Memory Save Failed",
                error
            );

        }

    }

    /* =======================================================
       GET
    ======================================================= */

    get(key){

        return this.data[key];

    }

    /* =======================================================
       SET
    ======================================================= */

    set(key,value){

        this.data[key]=value;

        this.save();

    }

    /* =======================================================
       GET ALL
    ======================================================= */

    getAll(){

        return {

            ...this.data

        };

    }

    /* =======================================================
       UPDATE
    ======================================================= */

    update(options){

        this.data = {

            ...this.data,

            ...options

        };

        this.save();

    }

    /* =======================================================
       RESET
    ======================================================= */

    reset(){

        localStorage.removeItem(
            this.storageKey
        );

        this.data = {

            language : "auto",

            voice : "",

            provider : "browser",

            rate : 1,

            pitch : 1,

            volume : 1,

            autoDetect : true,

            stream : true,

            fallback : true

        };

    }

    /* =======================================================
       EXPORT
    ======================================================= */

    export(){

        return JSON.stringify(

            this.data,

            null,

            4

        );

    }

    /* =======================================================
       IMPORT
    ======================================================= */

    import(json){

        try{

            this.data = {

                ...this.data,

                ...JSON.parse(json)

            };

            this.save();

        }

        catch(error){

            console.error(
                "Import Failed",
                error
            );

        }

    }

}