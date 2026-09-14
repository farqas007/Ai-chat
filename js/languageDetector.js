/* ===========================================================
   AI CHAT
   File : languageDetector.js
   Description : Smart Language Detection Engine
=========================================================== */

export class LanguageDetector {

    constructor(){

        this.urduRegex =
            /[\u0600-\u06FF]/;

        this.hindiRegex =
            /[\u0900-\u097F]/;

        this.englishRegex =
            /[A-Za-z]/;

        this.romanUrduWords = [

            "mera",
            "meri",
            "mujhe",
            "tum",
            "tumhara",
            "tumhari",
            "aap",
            "ka",
            "ki",
            "ke",
            "hai",
            "ho",
            "haan",
            "nahi",
            "kya",
            "kyun",
            "acha",
            "theek",
            "bhai",
            "allah",
            "inshallah",
            "jazakallah",
            "urdu",
            "shayari",
            "dua"

        ];

        console.log(
            "Language Detector Created"
        );

    }

    /* =======================================================
       MAIN DETECTION
    ======================================================= */

    detect(text=""){

        text = text.trim();

        const result = {

            language : "unknown",

            confidence : 0,

            script : "unknown",

            mixed : false,

            voiceLanguage : "en-US",

            category : "english"

        };

        if(!text){

            return result;

        }

        const hasUrdu =
            this.containsUrdu(text);

        const hasHindi =
            this.containsHindi(text);

        const hasEnglish =
            this.containsEnglish(text);

        const hasRoman =
            this.isRomanUrdu(text);

        if(hasUrdu){

            result.language = "urdu";
            result.script = "arabic";
            result.voiceLanguage = "ur-PK";
            result.category = "urdu";
            result.confidence = 1;

            return result;

        }

        if(hasHindi){

            result.language = "hindi";
            result.script = "devanagari";
            result.voiceLanguage = "hi-IN";
            result.category = "hindi";
            result.confidence = 1;

            return result;

        }

        if(hasRoman){

    result.language = "roman-urdu";
    result.script = "latin";

    // Roman Urdu ko Urdu-PK voice do
    result.voiceLanguage = "ur-PK";

    result.category = "roman";
    result.confidence = 0.90;

    return result;

}

        if(hasEnglish){

            result.language = "english";
            result.script = "latin";
            result.voiceLanguage = "en-US";
            result.category = "english";
            result.confidence = 0.95;

            return result;

        }

        return result;

    }

    /* =======================================================
       MIXED LANGUAGE
    ======================================================= */

    isMixed(text){

        return (

            this.containsUrdu(text)
            &&
            this.containsEnglish(text)

        );

    }

    /* =======================================================
       URDU
    ======================================================= */

    containsUrdu(text){

        return this.urduRegex.test(text);

    }

    /* =======================================================
       HINDI
    ======================================================= */

    containsHindi(text){

        return this.hindiRegex.test(text);

    }

    /* =======================================================
       ENGLISH
    ======================================================= */

    containsEnglish(text){

        return this.englishRegex.test(text);

    }

    /* =======================================================
       ROMAN URDU
    ======================================================= */

    isRomanUrdu(text){

        const words =
            text
            .toLowerCase()
            .split(/\s+/);

        let score = 0;

        words.forEach(word=>{

            if(

                this.romanUrduWords.includes(word)

            ){

                score++;

            }

        });

        return score >= 2;

    }

    /* =======================================================
       HELPERS
    ======================================================= */

    isUrdu(text){

        return this.detect(text).language==="urdu";

    }

    isEnglish(text){

        return this.detect(text).language==="english";

    }

    isRoman(text){

        return this.detect(text).language==="roman-urdu";

    }

    isHindi(text){

        return this.detect(text).language==="hindi";

    }

}