/* ===========================================================
   AI CHAT
   File : voiceCommands.js
   Description : Voice Commands
=========================================================== */

import Events from "./events.js";

export class VoiceCommands{

    constructor(){

        this.lastSpeech = "";

        console.log(
            "Voice Commands Created"
        );

    }

    /* =======================================================
       SET LAST SPEECH
    ======================================================= */

    setLastSpeech(text){

        this.lastSpeech = text;

    }

    /* =======================================================
       HANDLE
    ======================================================= */

    handle(text){

        if(!text){

            return false;

        }

        text = text.toLowerCase().trim();

        /* ==========================
           STOP
        ========================== */

        if(

            text === "stop" ||

            text === "stop voice"

        ){

            Events.emit(
                "voice:stop"
            );

            return true;

        }

        /* ==========================
           PAUSE
        ========================== */

        if(

            text === "pause"

        ){

            Events.emit(
                "voice:pause"
            );

            return true;

        }

        /* ==========================
           RESUME
        ========================== */

        if(

            text === "resume"

        ){

            Events.emit(
                "voice:resume"
            );

            return true;

        }

        /* ==========================
           REPEAT
        ========================== */

        if(

            text === "repeat"

        ){

            Events.emit(

                "voice:repeat",

                this.lastSpeech

            );

            return true;

        }

        /* ==========================
           NEW CHAT
        ========================== */

        if(

            text === "new chat"

        ){

            Events.emit(
                "chat:new"
            );

            return true;

        }

        /* ==========================
           CLEAR CHAT
        ========================== */

        if(

            text === "clear chat"

        ){

            Events.emit(
                "chat:clear"
            );

            return true;

        }

        /* ==========================
           SETTINGS
        ========================== */

        if(

            text === "settings"

        ){

            Events.emit(
                "voice:settings"
            );

            return true;

        }

        return false;

    }

}