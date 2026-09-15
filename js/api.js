/* ===========================================================
   AI CHAT
   File : api.js
   Description : AI API Manager
=========================================================== */


import Events from "./events.js";


/* ===========================================================
   API ERROR
=========================================================== */

export class APIError extends Error {

    constructor(status, message) {
        super(message);
        this.name = "APIError";
        this.status = status || 0;
    }

}


/* ===========================================================
   API MANAGER
=========================================================== */


export class API {


    constructor(){

        this.config = {
            provider: "openrouter",
            endpoint: "/api/chat",
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
       AUTH HEADERS
       Authentication relies on the HttpOnly session cookie (or a
       server-side token). The client never holds SERVER_API_TOKEN,
       so no token is attached from JavaScript/localStorage here.
    ======================================================= */


    getAuthHeaders(){

        return {
            "Content-Type": "application/json"
        };

    }


    /* =======================================================
       READ RESPONSE
       Always reads the body safely: JSON and non-JSON responses
       are handled without uncontrolled parse errors, and the
       HTTP status is checked before the payload is trusted.
    ======================================================= */

    async readJsonResponse(response) {

        if (!response) {
            throw new APIError(0, "No response from server.");
        }

        const contentType = response.headers.get("content-type") || "";

        const isJson = contentType.includes("application/json");

        if (!isJson) {

            const text = await response.text().catch(() => "");

            throw new APIError(
                response.status,
                this.messageForStatus(response.status)
            );

        }

        const data = await response.json().catch(() => null);

        if (!response.ok) {

            const serverMessage =
                data &&
                (data.error || data.message);

            throw new APIError(
                response.status,
                serverMessage || this.messageForStatus(response.status)
            );

        }

        return data;

    }


    /* =======================================================
       STATUS MESSAGE
       Clean user-facing fallback per status. Never echoes raw
       provider internals.
    ======================================================= */

    messageForStatus(status) {

        if (status === 401 || status === 403) {
            return "Authentication failed. Please log in again.";
        }

        if (status === 429) {
            return "Too many requests. Please wait a moment and try again.";
        }

        if (status >= 500) {
            return "The server is temporarily unavailable. Please try again.";
        }

        if (status >= 400) {
            return `Request failed (${status}). Please try again.`;
        }

        return "Request failed. Please try again.";

    }


    /* =======================================================
       IS RETRYABLE
       Retry only genuinely transient failures: network errors,
       429 and 5xx. Never retry 4xx client errors, 401/403 auth
       failures, or user-initiated aborts.
    ======================================================= */

    isRetryable(error) {

        if (!error) {
            return false;
        }

        if (error.name === "AbortError") {
            return false;
        }

        if (error instanceof TypeError) {
            // Network-level failure (fetch could not connect).
            return true;
        }

        if (error.name === "APIError") {
            const status = error.status;
            return status === 429 || status >= 500;
        }

        return false;

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
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    message,
                    history
                })
            }
        );

        const data = await this.readJsonResponse(response);

        if (data && data.success === false) {
            throw new APIError(
                response.status,
                data.error || "AI request failed"
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
async sendWithRetry(message, history = [], options = {}){

    const maxRetries = options.retries ?? 2;

    const baseDelay = options.delay ?? 800;

    let attempt = 0;

    for (;;) {

        try {

            const response = await this.sendMessage(message, history);

            return this.parseResponse(response);

        }
        catch (error) {

            const retryable = this.isRetryable(error);

            if (!retryable || attempt >= maxRetries) {
                throw error;
            }

            attempt++;

            await this.delay(baseDelay * attempt);

        }

    }

}


    /* =======================================================
       DELAY
    ======================================================= */

    delay(ms) {

        return new Promise(resolve => setTimeout(resolve, ms));

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
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    message,
                    history
                })
            }
        );

        const data = await this.readJsonResponse(response);

        if (data && data.success === false) {
            throw new APIError(
                response.status,
                data.error || "Stream request failed"
            );
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