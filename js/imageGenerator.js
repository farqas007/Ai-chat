/* ===========================================================
   AI CHAT
   File : imageGenerator.js
   Description : Image Generation Manager

   Uses the synchronous Workers AI endpoint (POST /generate-image)
   which returns a base64 data URI in a single request. No polling
   or prediction-ID tracking is needed.
=========================================================== */


import Events from "./events.js";


/* ===========================================================
   IMAGE GENERATOR
=========================================================== */


export class ImageGenerator {


    constructor(){

        this.config = {
            provider: "workers-ai",
            endpoint: "/generate-image"
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
       POST the prompt; receive { success, image } synchronously.
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

        if (typeof data.image !== "string" || !data.image) {
            throw new Error("Image generation returned no image data.");
        }

        const image = {
            id: "img_" + Date.now(),
            prompt,
            url: data.image,
            createdAt: new Date().toISOString()
        };

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
=========================================================== */


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

        this.clear();

        console.log("Image Generator Destroyed");

    }


}
