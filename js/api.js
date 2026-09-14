/* ===========================================================
   AI CHAT
   File : api.js
   Description : AI API Manager
=========================================================== */


import Events from "./events.js";


/* ===========================================================
   API MANAGER
=========================================================== */


export class API {


    constructor(){

        this.config = {
            provider: "openrouter",
            endpoint: "http://localhost:3000/api/chat",
            model: "openai/gpt-4o-mini",
            temperature: 0.7,
            maxTokens: 2048
        };

        this.state = {
            connected: false,
            loading: false
        };

        console.log("API Manager Created");

    }


    /* =======================================================
       SET CONFIG
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
       CHECK CONNECTION
    ======================================================= */


    isConnected(){
        return this.state.connected;
    }


    /* =======================================================
       SEND MESSAGE
    ======================================================= */
async sendMessage(message, history = []) {

    if (!message) {
        return null;
    }

    this.state.loading = true;

    Events.emit("api:loading", true);

    try {

        const response = await fetch(
            this.config.endpoint,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message,
                    history
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.error ||
                data.message ||
                "AI request failed"
            );
        }

        this.trackUsage(data);

        this.state.connected = true;

        return data;

    }

    catch (error) {

        this.state.connected = false;

        Events.emit("api:error", error);

        throw error;

    }

    finally {

        this.state.loading = false;

        Events.emit("api:loading", false);

    }

}
    /* =======================================================
   ABORT CONTROLLER
======================================================= */

createAbortController() {

    this.controller = new AbortController();

    return this.controller;

}


/* =======================================================
   CANCEL REQUEST
======================================================= */

cancelRequest() {

    if (this.controller) {

        this.controller.abort();

        this.state.loading = false;

        Events.emit("api:cancelled");

    }

}


/* =======================================================
   PARSE RESPONSE
======================================================= */

parseResponse(data) {

    if (!data) {
        return "";
    }

    /*
       Server Proxy Response { success, content }
    */

    if (data.content) {
        return data.content;
    }

    /*
       OpenAI Style Response
    */

    if (data.choices && data.choices[0]) {
        return data.choices[0].message?.content || "";
    }

    /*
       Simple Text Response
    */

    if (data.text) {
        return data.text;
    }

    return JSON.stringify(data);

}


/* =======================================================
   SEND WITH RETRY
======================================================= */
async sendWithRetry(message, history = []){

    const response = await this.sendMessage(message, history);

    return this.parseResponse(response);

}
/* =======================================================
   TRACK USAGE
======================================================= */

trackUsage(data) {

    if (!data) {
        return;
    }

    const usage = {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        date: new Date().toISOString()
    };

    Events.emit("api:usage", usage);

    return usage;

}


/* =======================================================
   STREAM RESPONSE
======================================================= */

async streamMessage(message, history = []){

    this.state.loading = true;

    Events.emit("stream:start");

    try {

        const response = await fetch(
            this.config.endpoint,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message,
                    history
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Stream request failed");
        }

        const content = this.parseResponse(data);

        Events.emit("stream:end", content);

        return content;

    }

    catch (error) {

        Events.emit("api:error", error);

        throw error;

    }

    finally {

        this.state.loading = false;

    }

}


}