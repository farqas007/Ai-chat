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
       AUTH HEADERS (optional bearer token for production)
    ======================================================= */


    getAuthHeaders(){

        const headers = {
            "Content-Type": "application/json"
        };

        const token =
            window.AI_CHAT_TOKEN ||
            localStorage.getItem("ai_chat_token") ||
            "";

        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        return headers;

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

        const data = await response.json();

        if (!response.ok || !data.success) {
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
   CHECK IMAGE STATUS
======================================================= */


async checkStatus(id){

    try{

        const response = await fetch(
            `${this.config.endpoint}/${id}`,
            { method: "GET", headers: this.getAuthHeaders() }
        );

        return await response.json();

    }

    catch(error){

        throw error;

    }

}

/* =======================================================
   WAIT FOR IMAGE
======================================================= */


async waitForImage(id){

    return new Promise((resolve, reject)=>{

        const timer = setInterval(async()=>{

            try {

                const result = await this.checkStatus(id);

                if (result.status === "succeeded") {
                    clearInterval(timer);
                    resolve(Array.isArray(result.output) ? result.output[0] : result.output);
                }

                if (result.status === "failed") {
                    clearInterval(timer);
                    reject("Image generation failed");
                }

            } catch (error) {
                clearInterval(timer);
                reject(error);
            }

        }, 2000);

    });

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