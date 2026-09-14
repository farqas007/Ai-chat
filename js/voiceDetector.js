/* ===========================================================
   AI CHAT
   File : voiceDetector.js
   Description : Smart Language Detection
=========================================================== */

export class VoiceDetector {

    constructor() {

        console.log(
            "Voice Detector Created"
        );

    }

    /* =======================================================
       DETECT
    ======================================================= */

    detect(text = "") {

        text = text.trim();

        if (!text) {

            return {

                language: "unknown",
                hasUrdu: false,
                hasEnglish: false,
                hasRoman: false

            };

        }

        const hasUrdu =
            /[\u0600-\u06FF]/.test(text);

        const hasEnglish =
            /[A-Za-z]/.test(text);

        const lower =
            text.toLowerCase();

        const romanWords = [

            "mera",
            "meri",
            "mujhe",
            "main",
            "mein",
            "tum",
            "aap",
            "hai",
            "ho",
            "hun",
            "ka",
            "ki",
            "ke",
            "kya",
            "acha",
            "theek",
            "allah",
            "inshallah",
            "urdu",
            "roman",
            "shayari"

        ];

        const hasRoman =
            romanWords.some(
                word => lower.includes(word)
            );

        let language = "english";

        if (hasUrdu && hasEnglish) {

            language = "mixed";

        }
        else if (hasUrdu) {

            language = "urdu";

        }
        else if (hasRoman) {

            language = "roman";

        }

        return {

            language,

            hasUrdu,

            hasEnglish,

            hasRoman

        };

    }

}