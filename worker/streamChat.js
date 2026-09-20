/* ===========================================================
   AI CHAT
   File : worker/streamChat.js
   Description : Native Cloudflare Workers SSE streaming for the
   /api/chat (stream:true) path.

   Why a native path: SSE written through Express ServerResponse /
   cloudflare:node httpServerHandler never reaches the client on
   the Workers runtime (HTTP 200 with text/event-stream headers but
   a 0-byte body). This module returns a native Response +
   ReadableStream instead — the documented Workers SSE pattern —
   and is used ONLY for that one streaming route. The non-stream
   JSON /api/chat branch and every other route stay on Express.

   The pure parse/format helpers from the Node server
   (server/streamChat.js formatSSE/createSSEParser/extractDeltaContent
   and server/upstreamErrors.js) are reused, so the wire contract is
   byte-for-byte what server/streamChat.js already emits (and what
   js/api.js already parses):

       event: delta    data: {"delta":"..."}
       event: error    data: {"error":"<sanitized>"}
       event: done     data: {}

   Authentication reuses worker/auth.js (createWorkerRequireAuth)
   and worker/session.js with the exact policy values the Express
   /api/chat route uses.
   =========================================================== */

import {
    createSSEParser,
    extractDeltaContent,
    formatSSE,
    sanitizeHistory
} from "../server/streamChat.js";

import {
    readUpstreamJson,
    handleUpstreamError,
    UpstreamHttpError,
    GENERIC_SERVER_ERROR
} from "../server/upstreamErrors.js";

import { createWorkerRequireAuth } from "./auth.js";


/* Same model/config defaults and upstream as server/streamChat.js
   and the Express /api/chat route. */

const DEFAULT_UPSTREAM_URL =
    "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_TIMEOUT_MS = 60000;

const DEFAULT_MODEL = "openai/gpt-4o-mini";

const DEFAULT_TEMPERATURE = 0.7;

const DEFAULT_MAX_TOKENS = 2048;

/* Max accepted JSON body on the native stream path. Mirrors the Express
   `express.json({ limit: "1mb" })` used on both servers so an oversized
   body gets a 413 instead of unbounded memory use. */
export const MAX_BODY_BYTES = 1024 * 1024;

const RETRY_AFTER_SECONDS = 60;


/* Security/CSP posture mirrored from the Express middleware in
   worker/index.js, applied to every native-path response. */

export const API_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; " +
        "img-src 'self' data: https:; font-src 'self'; connect-src 'self'; " +
        "object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};


/* ===========================================================
   BODY READING (size-capped)
   Parses a Request body as JSON, rejecting anything bigger than
   maxBytes (byte-counted) with a 413-visible signal instead of
   buffering unbounded input.
   =========================================================== */

export async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {

    const rawLength = request.headers && request.headers.get
        ? request.headers.get("content-length")
        : null;

    if (rawLength !== null) {
        const length = Number(rawLength);
        if (Number.isFinite(length) && length > maxBytes) {
            return { ok: false, tooLarge: true, body: null };
        }
    }

    let chunks = [];

    let totalBytes = 0;

    try {
        const reader = request.body && request.body.getReader();

        if (!reader) {
            return { ok: false, tooLarge: false, body: null };
        }

        for (;;) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                return { ok: false, tooLarge: true, body: null };
            }
            chunks.push(value);
        }
    } catch {
        return { ok: false, tooLarge: false, body: null };
    }

    if (totalBytes > maxBytes) {
        return { ok: false, tooLarge: true, body: null };
    }

    let text = "";

    try {
        const decoder = new TextDecoder();
        for (const chunk of chunks) {
            text += decoder.decode(chunk, { stream: true });
        }
        text += decoder.decode();
    } catch {
        return { ok: false, tooLarge: false, body: null };
    }

    try {
        return { ok: true, tooLarge: false, body: JSON.parse(text) };
    } catch {
        return { ok: false, tooLarge: false, body: null };
    }

}


/* ===========================================================
   AUTHENTICATION
   Reuses the exact middleware created by worker/auth.js with the
   same policy values the Express /api/chat route uses
   (authDisabled / SERVER_API_TOKEN / SESSION_SECRET). Resolves
   { ok: true } or { ok: false, status, error } carrying the
   middleware's 503/401 payloads (fail closed).
   =========================================================== */

export function authenticateStreamRequest(request, {
    authDisabled,
    apiToken,
    sessionSecret
}) {

    const requireAuth = createWorkerRequireAuth({
        authDisabled,
        apiToken,
        sessionSecret
    });

    return new Promise(resolve => {

        const req = {
            headers: {
                cookie: request.headers.get("cookie") || "",
                authorization: request.headers.get("authorization") || ""
            }
        };

        let status = null;

        const res = {
            status(code) {
                status = code;
                return this;
            },
            json(payload) {
                resolve({
                    ok: false,
                    status,
                    error: payload && payload.error
                        ? payload.error
                        : "Unauthorized"
                });
            }
        };

        requireAuth(req, res, () => resolve({ ok: true }));

    });

}


/* ===========================================================
   NATIVE SSE READABLE STREAM
   Reads OpenRouter's stream incrementally and emits the normalized
   SSE protocol via enqueue() into a ReadableStream. Sanitizes all
   errors, aborts the upstream on client cancel and on the ~60s
   idle timeout, and always closes after [DONE]/error.
   =========================================================== */

export function createChatSseStream(config) {

    const {
        openrouterKey,
        systemPrompt,
        message,
        history = [],
        upstreamUrl = DEFAULT_UPSTREAM_URL,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        model = DEFAULT_MODEL,
        temperature = DEFAULT_TEMPERATURE,
        maxTokens = DEFAULT_MAX_TOKENS,
        fetchImpl = fetch
    } = config;

    const encoder = new TextEncoder();

    const controller = new AbortController();

    let idleTimer = null;

    let settled = false;

    const clearIdle = () => {
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
    };

    const armIdle = () => {
        clearIdle();
        idleTimer = setTimeout(() => {
            if (!controller.signal.aborted) {
                controller.abort();
            }
        }, timeoutMs);
    };

    return new ReadableStream({

        cancel() {
            clearIdle();
            if (!controller.signal.aborted) {
                controller.abort();
            }
        },

        start(startController) {

            const pump = async () => {

                const emit = (event, payload) => {
                    try {
                        startController.enqueue(
                            encoder.encode(formatSSE(event, payload))
                        );
                        return true;
                    } catch {
                        return false;
                    }
                };

                const finish = () => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearIdle();
                    try {
                        startController.close();
                    } catch {
                        // Client already cancelled the stream.
                    }
                };

                const errorEvent = error => {
                    if (settled) {
                        return false;
                    }
                    const safe = handleUpstreamError(error);
                    return emit("error", { error: safe.message });
                };

                const upstreamFailureMessage = async response => {
                    let failure = new UpstreamHttpError(
                        response.status,
                        "Upstream request failed"
                    );
                    try {
                        await readUpstreamJson(response);
                    } catch (error) {
                        failure = error instanceof UpstreamHttpError
                            ? error
                            : new UpstreamHttpError(
                                response.status,
                                "Upstream request failed"
                            );
                    }
                    return handleUpstreamError(failure).message;
                };

                let response;

                try {
                    armIdle();
                    response = await fetchImpl(upstreamUrl, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${openrouterKey}`
                        },
                        body: JSON.stringify({
                            model,
                            messages: [
                                { role: "system", content: systemPrompt },
                                ...sanitizeHistory(history),
                                { role: "user", content: message }
                            ],
                            temperature,
                            max_tokens: maxTokens,
                            stream: true
                        }),
                        signal: controller.signal
                    });
                } catch (error) {
                    errorEvent(error);
                    finish();
                    return;
                }

                if (settled) {
                    return;
                }

                if (!response.ok) {
                    const safeMessage = await upstreamFailureMessage(response);
                    emit("error", { error: safeMessage });
                    finish();
                    return;
                }

                if (!response.body) {
                    emit("done", {});
                    finish();
                    return;
                }

                const reader = response.body.getReader();

                const parser = createSSEParser();

                let sawDone = false;

                let stopped = false;

                try {

                    for (;;) {

                        let result;

                        try {
                            result = await reader.read();
                        } catch (error) {
                            errorEvent(error);
                            stopped = true;
                            break;
                        }

                        if (result.done) {
                            break;
                        }

                        armIdle();

                        for (const payload of parser.push(result.value)) {

                            const parsed = extractDeltaContent(payload);

                            if (parsed.done) {
                                sawDone = true;
                                emit("done", {});
                                break;
                            }

                            if (parsed.error) {
                                stopped = true;
                                emit("error", { error: GENERIC_SERVER_ERROR });
                                break;
                            }

                            if (parsed.delta) {
                                armIdle();
                                emit("delta", { delta: parsed.delta });
                            }

                        }

                        if (sawDone || stopped) {
                            break;
                        }

                    }

                    if (!sawDone && !stopped) {

                        const trailing = parser.flush();

                        if (trailing === null) {
                            emit("done", {});
                        } else {
                            const parsed = extractDeltaContent(trailing);
                            if (parsed.done) {
                                emit("done", {});
                            } else if (parsed.error) {
                                emit("error", { error: GENERIC_SERVER_ERROR });
                            } else if (parsed.delta) {
                                emit("delta", { delta: parsed.delta });
                                emit("done", {});
                            }
                        }

                    }

                } catch (error) {
                    errorEvent(error);
                } finally {
                    finish();
                }

            };

            pump().catch(() => {
                clearIdle();
                try {
                    startController.close();
                } catch {
                    // Already closed/cancelled.
                }
            });

        }

    });

}


/* ===========================================================
   MAIN ENTRY
   Authenticates, validates the request, and returns a native
   Response. JSON error responses mirror the Express route's
   shapes and ordering (auth -> key configured -> message valid).
   All responses carry the API security headers (and CORS when the
   origin is allowed), matching the Express middleware behavior.
   =========================================================== */

export async function createStreamChatResponse(request, config = {}) {

    const {
        authDisabled = false,
        apiToken = "",
        sessionSecret = "",
        openrouterKey = "",
        systemPrompt = "",
        allowedOrigins = [],
        rateLimiter = null,
        upstreamUrl = DEFAULT_UPSTREAM_URL,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        model = DEFAULT_MODEL,
        temperature = DEFAULT_TEMPERATURE,
        maxTokens = DEFAULT_MAX_TOKENS,
        fetchImpl = fetch
    } = config;

    const jsonError = (status, error) => new Response(
        JSON.stringify({ success: false, error }),
        {
            status,
            headers: Object.assign(
                { "Content-Type": "application/json" },
                API_SECURITY_HEADERS
            )
        }
    );

    /* Body-size gate first (matches Express: express.json parses before
       auth, so oversized payloads are rejected up front with a 413). */
    const declaredLength = request.headers.get
        ? Number(request.headers.get("content-length") || 0)
        : 0;

    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        return jsonError(413, "Payload too large.");
    }

    const auth = await authenticateStreamRequest(request, {
        authDisabled,
        apiToken,
        sessionSecret
    });

    if (!auth.ok) {
        return jsonError(auth.status, auth.error);
    }

    /* In-memory per-isolate rate limit, applied after auth to mirror the
       Express route ordering (requireAuth -> rate limit -> handler). */
    if (
        rateLimiter &&
        typeof rateLimiter.allowRequest === "function" &&
        !rateLimiter.allowRequest(request, "/api/chat")
    ) {
        const headers = Object.assign({}, API_SECURITY_HEADERS, {
            "Content-Type": "application/json",
            "Retry-After": String(RETRY_AFTER_SECONDS)
        });
        return new Response(
            JSON.stringify({
                success: false,
                error: "Too many requests. Please try again shortly."
            }),
            { status: 429, headers }
        );
    }

    if (!openrouterKey) {
        return jsonError(
            503,
            "OPENROUTER_API_KEY not configured on server."
        );
    }

    let body;

    const parsed = await readJsonBody(request);

    if (parsed.tooLarge) {
        return jsonError(413, "Payload too large.");
    }

    body = parsed.ok ? parsed.body : null;

    const message = body && typeof body.message === "string"
        ? body.message
        : "";

    const history = Array.isArray(body && body.history)
        ? body.history
        : [];

    if (!message || !message.trim()) {
        return jsonError(400, "Message is required.");
    }

    const origin =
        request.headers && request.headers.get
            ? request.headers.get("origin")
            : null;

    const responseHeaders = {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no"
    };

    for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
        responseHeaders[key] = value;
    }

    const proto = request.headers && request.headers.get
        ? request.headers.get("x-forwarded-proto")
        : null;

    if (proto === "https") {
        responseHeaders["Strict-Transport-Security"] =
            "max-age=31536000; includeSubDomains";
    }

    if (origin && Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
        responseHeaders["Access-Control-Allow-Origin"] = origin;
    }

    return new Response(
        createChatSseStream({
            openrouterKey,
            systemPrompt,
            message,
            history,
            upstreamUrl,
            timeoutMs,
            model,
            temperature,
            maxTokens,
            fetchImpl
        }),
        {
            status: 200,
            headers: responseHeaders
        }
    );

}