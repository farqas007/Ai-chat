/* ===========================================================
   AI CHAT
   File : voicePlayer.js
   Description : Speech Player
=========================================================== */

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

        speech.rate =
            this.settings.rate ?? 1;

        speech.pitch =
            this.settings.pitch ?? 1;

        speech.volume =
            this.settings.volume ?? 1;

       if (voice) {

    speech.voice = voice;
    speech.lang = voice.lang;

}
else{

    speech.lang = lang;

}

        speech.onstart = () => {

            if (onStart) {

                onStart();

            }

        };

        speech.onend = () => {

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

        try {

            this.synthesis.speak(
                speech
            );

        }
        catch (error) {

            // A synchronous throw means this utterance never became
            // "current", so onerror/onend will never fire and the
            // queue would stall forever. Recover by reporting the
            // error immediately so the caller advances the queue.
            if (onError) {

                onError(error);

            }

        }

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