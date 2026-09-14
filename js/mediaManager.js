/* ===========================================================
   AI CHAT
   File : mediaManager.js
   Description : Media Library Manager
   Note : Manages user media assets stored locally under
   assets/media. Media generation still requires a backend
   provider (e.g. a video/audio API). This module provides
   file management only and reports clearly when generation
   support is not configured.
=========================================================== */


import Events from "./events.js";


/* ===========================================================
   MEDIA MANAGER
=========================================================== */


export class MediaManager {


    constructor(options = {}){

        this.config = {
            directory: "assets/media",
            ...options
        };

        this.state = {
            enabled: false,
            items: []
        };

        // Media generation requires a backend provider.
        // Kept disabled until a real provider is wired up.
        this.state.enabled = Boolean(this.config.provider);

        console.log("Media Manager Created");

    }


    /* =======================================================
       CONFIGURE
    ======================================================= */


    configure(options = {}){

        this.config = {
            ...this.config,
            ...options
        };

        this.state.enabled = Boolean(this.config.provider);

    }


    /* =======================================================
       GET GENERATION STATUS
    ======================================================= */


    isEnabled(){

        return this.state.enabled;

    }


    /* =======================================================
       LIST MEDIA FILES
    ======================================================= */


    async list(){

        try {

            const fs = await import("fs/promises");

            const entries = await fs.readdir(
                this.config.directory
            );

            this.state.items = entries.filter(
                name =>
                    /\.(png|jpe?g|gif|webp|mp4|webm|ogg|mp3)$/i
                    .test(name)
            );

            Events.emit("media:list", this.state.items);

            return this.state.items;

        } catch (error) {

            this.state.items = [];

            Events.emit("media:error", {
                message: "Media directory not found",
                directory: this.config.directory,
                error
            });

            return [];

        }

    }


    /* =======================================================
       GET GENERATION TEST
    ======================================================= */


    async generate(){


        if(!this.state.enabled){

            const error = new Error(
                "Media generation is not configured. " +
                "Connect a backend provider (e.g. Replicate) " +
                "and set a provider in MediaManager config."
            );

            Events.emit("media:error", error);

            throw error;

        }


        Events.emit("media:required", {
            message: "Media generation backend not implemented yet.",
            provider: this.config.provider || null
        });


        return null;

    }


    /* =======================================================
       CLEAR
    ======================================================= */


    clear(){

        this.state.items = [];

    }


    /* =======================================================
       DESTROY
    ======================================================= */


    destroy(){

        this.clear();

        console.log("Media Manager Destroyed");

    }


}