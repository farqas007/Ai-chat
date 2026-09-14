/* ===========================================================
   AI CHAT
   File : streamVoice.js
   Description : Streaming Voice Manager
=========================================================== */

export class StreamVoice {

    constructor(queue) {

        this.queue = queue;

        this.buffer = "";

        this.streaming = false;

        console.log(
            "Stream Voice Created"
        );

    }

    /* =======================================================
       START
    ======================================================= */

    start() {

        this.buffer = "";

        this.streaming = true;

    }

    /* =======================================================
       PUSH TEXT
    ======================================================= */

    push(text = "") {

        if (!this.streaming) {

            return;

        }

        this.buffer += text;

        const sentences =
            this.buffer.split(
                /(?<=[.!?؟۔])\s+/u
            );

        while (sentences.length > 1) {

            const sentence =
                sentences.shift().trim();

            if (sentence) {

                this.queue.add(sentence);

            }

        }

        this.buffer =
            sentences.join(" ");

    }

    /* =======================================================
       FINISH
    ======================================================= */

    finish() {

        if (

            this.buffer.trim()

        ) {

            this.queue.add(

                this.buffer.trim()

            );

        }

        this.buffer = "";

        this.streaming = false;

    }

    /* =======================================================
       CANCEL
    ======================================================= */

    cancel() {

        this.buffer = "";

        this.streaming = false;

    }

}