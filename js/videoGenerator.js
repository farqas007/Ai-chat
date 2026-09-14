/* ===========================================================
   AI CHAT
   File : videoGenerator.js
   Description : Video Generation Manager
   Note : Video generation requests are proxied through the
   backend server. No server-side video endpoint or API key is
   configured yet, so generation reports a clear, actionable
   error instead of failing silently. Wire up a server
   endpoint (e.g. Replicate video model) to enable.
=========================================================== */


import Events from "./events.js";


/* ===========================================================
   VIDEO GENERATOR
=========================================================== */


export class VideoGenerator {


    constructor(){

        this.config = {
            provider: "replicate",
            endpoint: "/generate-video",
            model: "stability-ai/stable-video-diffusion"
        };

        this.state = {
            enabled: false,
            loading: false,
            videos: []
        };

        // Requires a server-side /generate-video endpoint +
        // a server API key. Not configured by default.
        console.log("Video Generator Created (backend not configured)");

    }


    /* =======================================================
       CONFIGURE
    ======================================================= */


    configure(options = {}){

        this.config = {
            ...this.config,
            ...options
        };

        this.state.enabled = Boolean(this.config.enabled);

    }


    /* =======================================================
       GENERATE VIDEO
    ======================================================= */


    async generate(prompt){

        if (!this.state.enabled) {

            const error = new Error(
                "Video generation is not configured. " +
                "Add a POST " + this.config.endpoint +
                " endpoint on the server with an API key, " +
                "then enable VideoGenerator."
            );

            Events.emit("video:error", error);

            throw error;

        }

        if(!prompt || !prompt.trim()){

            return null;

        }

        this.state.loading = true;

        Events.emit("video:start", { prompt });

        try {

            const response = await fetch(
                this.config.endpoint,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ prompt })
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || "Video API failed");
            }

            Events.emit("video:created", data);

            return data;

        } catch (error) {

            Events.emit("video:error", error);

            throw error;

        } finally {

            this.state.loading = false;

            Events.emit("video:end");

        }

    }


    /* =======================================================
       GET VIDEOS
    ======================================================= */


    getVideos(){

        return this.state.videos;

    }


    /* =======================================================
       CLEAR
    ======================================================= */


    clear(){

        this.state.videos = [];

    }


}