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
   SSE EVENT PARSER (client)
   Reassembles the server's normalized SSE stream. Handles
   multiple events per network read, one event split across
   reads, and UTF-8 multi-byte boundaries (TextDecoder). SSE
   comments (": ...") are dropped. Each complete event becomes
   { event, data }.
=========================================================== */

function createSSEEventParser() {

    let buffer = "";

    const decoder = new TextDecoder("utf-8");

    const normalizeEvent = (block, eventName) => {

        let data = "";

        for (let line of block.split("\n")) {

            if (line.endsWith("\r")) {
                line = line.slice(0, -1);
            }

            if (!line || line.startsWith(":")) {
                continue;
            }

            if (line.startsWith("event:")) {
                const name = line.slice(6).trim();
                if (name) {
                    eventName = name;
                }
            } else if (line.startsWith("data:")) {
                data += (data ? "\n" : "") + line.slice(5).replace(/^ /, "");
            }

        }

        return { event: eventName, data };

    };

    return {

        push(chunk) {

            const bytes = typeof chunk === "string"
                ? new TextEncoder().encode(chunk)
                : chunk;

            buffer += decoder.decode(bytes, { stream: true });

            buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

            const events = [];

            let index;

            while ((index = buffer.indexOf("\n\n")) !== -1) {

                const block = buffer.slice(0, index);

                buffer = buffer.slice(index + 2);

                events.push(normalizeEvent(block, "message"));

            }

            return events;

        },

        flush() {

            buffer += decoder.decode();

            const block = buffer;

            buffer = "";

            if (!block.trim()) {
                return [];
            }

            return [normalizeEvent(block, "message")];

        }

    };

}


/* ===========================================================
   STREAM MESSAGE SANITIZER
   Server messages should already be sanitized; this is a
   defensive net so raw provider/key/stack text can never
   escape to the caller. Falls back to a clean generic message.
=========================================================== */

function sanitizeStreamMessage(message, fallback) {

    const text = typeof message === "string" ? message : "";

    if (!text.trim()) {
        return fallback;
    }

    if (/(sk-[A-Za-z0-9]{8,}|sk-or-|api[_-]?key|secret|Bearer\s+\S+|ECONNREFUSED|EAI_AGAIN|at\s+\S+:\d+)/i.test(text)) {
        return fallback;
    }

    return text;

}


/* ===========================================================
   STREAM ERROR EVENT
   Reads the server's sanitized { error, ... } payload. Never
   lets provider internals escape.
=========================================================== */

function errorFromStreamEvent(data) {

    const fallback = "Stream failed. Please try again.";

    let message = fallback;

    if (typeof data === "string" && data.trim()) {

        try {

            const parsed = JSON.parse(data);

            if (parsed && typeof parsed.error === "string" && parsed.error.trim()) {
                message = parsed.error.trim();
            }

        } catch {}

    }

    return new APIError(0, sanitizeStreamMessage(message, fallback));

}


/* ===========================================================
   ABORT DETECTION
   Intentional AbortController cancellation is treated as a
   cancel, never as an unexpected API failure.
=========================================================== */

function isAbortError(error, signal) {

    return !!error && (
        error.name === "AbortError" ||
        (signal && signal.aborted)
    );

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

            await response.text().catch(() => "");

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


/* ===========================================================
   STREAM RESPONSE
   POSTs with stream:true and reads the server's normalized SSE
   stream. Re-emits deltas via onDelta, final content via onDone,
   and sanitized failures via onError. Supports AbortController
   cancellation through the existing createAbortController() /
   cancelRequest() helpers. Never exposes raw provider errors.
=========================================================== */

async streamMessage(message, history = [], callbacks = {}) {

    const onDelta = typeof callbacks.onDelta === "function" ? callbacks.onDelta : null;
    const onDone = typeof callbacks.onDone === "function" ? callbacks.onDone : null;
    const onError = typeof callbacks.onError === "function" ? callbacks.onError : null;

    if (!message) {
        return null;
    }

    const signal = this.controller && this.controller.signal;

    this.state.loading = true;

    Events.emit("stream:start");

    const failStream = error => {

        if (onError) {
            try {
                onError(error);
            } catch {
                // Consumer errors never mask the stream failure.
            }
        }

        Events.emit("api:error", error);

    };

    const finishStream = content => {

        this.state.connected = true;

        if (onDone) {
            try {
                onDone(content);
            } catch {
                // Consumer errors never break stream completion.
            }
        }

        Events.emit("stream:end", content);

    };

    let content = "";

    try {

        const response = await fetch(
            this.config.endpoint,
            {
                method: "POST",
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    message,
                    history,
                    stream: true
                }),
                signal
            }
        );

        /* HTTP errors before streaming starts keep the existing
           API error behavior: a clean APIError with a status
           based fallback, re-thrown for the caller. */

        if (!response.ok) {

            let messageText = this.messageForStatus(response.status);

            const contentType =
                (response.headers && response.headers.get &&
                 response.headers.get("content-type")) || "";

            if (contentType.includes("application/json")) {

                const data = await response.json().catch(() => null);

                if (data && data.error) {
                    messageText = sanitizeStreamMessage(data.error, messageText);
                }

            } else if (response.text) {

                await response.text().catch(() => "");

            }

            const apiError = new APIError(response.status, messageText);

            /* Let the catch block below own the single failStream()
               call so onError/api:error fire exactly once. */
            throw apiError;

        }

        if (!response.body) {

            finishStream(content);

            return content;

        }

        const reader = response.body.getReader();

        const parser = createSSEEventParser();

        let finished = false;

        let streamError = null;

        const applyEvents = events => {

            for (const event of events) {

                if (event.event === "done" || event.data === "[DONE]") {
                    finished = true;
                    return true;
                }

                if (event.event === "error") {
                    streamError = errorFromStreamEvent(event.data);
                    return true;
                }

                if (event.event === "delta") {

                    let parsed;

                    try {
                        parsed = JSON.parse(event.data);
                    } catch {
                        streamError = new APIError(0, "The stream returned invalid data. Please try again.");
                        return true;
                    }

                    if (!parsed || typeof parsed.delta !== "string") {
                        streamError = new APIError(0, "The stream returned invalid data. Please try again.");
                        return true;
                    }

                    if (parsed.delta) {

                        content += parsed.delta;

                        if (onDelta) {
                            onDelta(parsed.delta, content);
                        }

                    }

                }

            }

            return false;

        };

        for (;;) {

            let result;

            try {
                result = await reader.read();
            }
            catch (error) {
                if (!isAbortError(error, signal)) {
                    streamError = new APIError(0, "The stream was interrupted. Please try again.");
                }
                break;
            }

            if (result.done) {
                break;
            }

            if (applyEvents(parser.push(result.value))) {
                break;
            }

        }

        /* Drain a trailing event that arrived without its final
           blank line (or finalize an otherwise clean stream). */

        if (!streamError && !finished) {

            applyEvents(parser.flush());

        }

        if (streamError) {
            failStream(streamError);
            return content;
        }

        if (signal && signal.aborted) {
            return content || null;
        }

        finishStream(content);

        return content;

    }

    catch (error) {

        if (isAbortError(error, signal)) {
            return content || null;
        }

        failStream(error);

        throw error;

    }

    finally {

        this.state.loading = false;

    }

}


}