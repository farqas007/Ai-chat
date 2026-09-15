/* ===========================================================
   AI CHAT
   File : imageGenerator.js
   Description : Image Generation Manager
=========================================================== */


import Events from "./events.js";


/* ===========================================================
   IMAGE GENERATOR
=========================================================== */


export class ImageGenerator {


    constructor(){

        this.config = {
            provider: "replicate",
            endpoint: "/generate-image",
            model: "black-forest-labs/flux-schnell"
        };

        this.state = {
            loading: false,
            images: []
        };

        console.log("Image Generator Created");

    }


    /* =======================================================
       CONFIGURE
    ======================================================= */


    configure(options = {}){

        this.config = {
            ...this.config,
            ...options
        };

    }


    /* =======================================================
       SET API KEY (stored server-side only)
    ======================================================= */


    setApiKey(){
        console.warn("API keys are managed on the server. Ignoring client-side key.");
    }


    /* =======================================================
       AUTH HEADERS
       Authentication is cookie-based (httpOnly SameSite strict).
       No client-side token/Auth header is ever sent.
    ======================================================= */


    getAuthHeaders(){

        return {
            "Content-Type": "application/json"
        };

    }


    /* =======================================================
       GENERATE IMAGE
    ======================================================= */

async generate(prompt){

    if(!prompt || !prompt.trim()){
        return null;
    }

    this.state.loading = true;

    Events.emit("image:start", { prompt });

    try{

        const response = await fetch(
            this.config.endpoint,
            {
                method: "POST",
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ prompt })
            }
        );

        const data = await this.readJsonResponse(response, "Image API Failed");

        if (!data.success) {
            const error = data.error || "Image API Failed";
            console.error("Image Server Error:", error);
            throw new Error(error);
        }

        const image = {
            id: "img_" + Date.now(),
            prompt,
            predictionId: data.id,
            url: null,
            createdAt: new Date().toISOString()
        };

        const imageUrl = await this.waitForImage(data.id);

        image.url = imageUrl;

        this.state.images.push(image);

        Events.emit("image:created", image);

        return image;

    }

    catch(error){

        console.error("Image Generation Error:", error.message);

        Events.emit("image:error", error);

        throw error;

    }

    finally{

        this.state.loading = false;

        Events.emit("image:end");

    }

}

/* =======================================================
   SAFE JSON RESPONSE READER
======================================================= */


async readJsonResponse(response, fallbackMessage){

    const text = await response.text();

    let data = null;

    try {
        data = text ? JSON.parse(text) : null;
    }
    catch {
        data = null;
    }

    if (!response.ok || !data) {
        const error = (data && data.error) || fallbackMessage;
        throw new Error(error);
    }

    return data;

}
   /* =======================================================
   CHECK IMAGE STATUS
======================================================= */


async checkStatus(id){

    const response = await fetch(
        `${this.config.endpoint}/${id}`,
        { method: "GET", headers: this.getAuthHeaders() }
    );

    return this.readJsonResponse(response, "Failed to check image status");

}

/* =======================================================
   WAIT FOR IMAGE
   Polls with a bounded timeout. The polling timer is
   guaranteed to be cleared on success, failure, timeout
   or destroy() — no interval is ever leaked.
======================================================= */


async waitForImage(id){

    this._stopPolling();

    return new Promise((resolve, reject)=>{

        const started = Date.now();
        const timeout = this.config.pollTimeout ?? 120000;
        const intervalMs = this.config.pollInterval ?? 2000;

        this._pollResolve = (value)=>{
            this._stopTimer();
            this._pollResolve = null;
            this._pollReject = null;
            resolve(value);
        };

        this._pollReject = (error)=>{
            this._stopTimer();
            this._pollResolve = null;
            this._pollReject = null;
            reject(error);
        };

        this._pollTimer = setInterval(async ()=>{

            if (Date.now() - started >= timeout) {
                this._pollReject(new Error("Image generation timed out. Please try again."));
                return;
            }

            try {

                const result = await this.checkStatus(id);

                if (result.status === "succeeded") {
                    this._pollResolve(Array.isArray(result.output) ? result.output[0] : result.output);
                }

                if (result.status === "failed") {
                    this._pollReject(new Error("Image generation failed"));
                }

            } catch (error) {
                this._pollReject(error);
            }

        }, intervalMs);

    });

}

_stopTimer(){

    if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
    }

}

_stopPolling(){

    this._stopTimer();

    if (this._pollReject) {
        const reject = this._pollReject;
        this._pollResolve = null;
        this._pollReject = null;
        reject(new Error("Image generation cancelled"));
    }

}

/* =======================================================
       GET IMAGES
    ======================================================= */


    getImages(){

        return this.state.images;

    }


    /* =======================================================
       CLEAR
    ======================================================= */


    clear(){

        this.state.images = [];

    }


    /* =======================================================
       DESTROY
    ======================================================= */


    destroy(){

        this._stopPolling();

        this.clear();

        console.log("Image Generator Destroyed");

    }


}