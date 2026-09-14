/* ===========================================================
   AI CHAT
   File : voicePlayer.js
   Description : Speech Player
=========================================================== */

import Events from "./events.js";

export class VoicePlayer {

   constructor(synthesis, settings) {

    this.synthesis = synthesis;

    this.settings = settings;

    console.log(
        "Voice Player Created"
    );

}

    /* =======================================================
       PLAY
    ======================================================= */

    play({

        text,
        voice,
        lang,
        onStart,
        onEnd,
        onError

    }) {

        if (!text) {

            return;

        }

        const speech = new SpeechSynthesisUtterance(
            text
        );

        speech.rate = 0.95;

        speech.pitch =
            this.settings.pitch;

        speech.volume =
            this.settings.volume;

       if (voice) {

    speech.voice = voice;
    speech.lang = voice.lang;

}
else{

    speech.lang = lang;

}

        speech.onstart = () => {

            Events.emit(
                "voice:speak:start"
            );

            if (onStart) {

                onStart();

            }

        };

        speech.onend = () => {

            Events.emit(
                "voice:speak:end"
            );

            if (onEnd) {

                onEnd();

            }

        };

        speech.onerror = error => {

            if (onError) {

                onError(error);

            }

        };

        console.log(

            "PLAYING:",

            speech.voice?.name,

            speech.lang,

            speech.text

        );

        this.synthesis.speak(
            speech
        );

    }

    

    /* =======================================================
       STOP
    ======================================================= */

    stop() {

        this.synthesis.cancel();

    }

    /* =======================================================
       PAUSE
    ======================================================= */

    pause() {

        this.synthesis.pause();

    }

    /* =======================================================
       RESUME
    ======================================================= */

    resume() {

        this.synthesis.resume();

    }

    /* =======================================================
       STATUS
    ======================================================= */

    isSpeaking() {

        return this.synthesis.speaking;

    }

    isPaused() {

        return this.synthesis.paused;

    }

}