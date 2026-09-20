/* ===========================================================
   AI CHAT
   File : streamChat.js
   Description : Secure backend SSE streaming for the /api/chat
   proxy. Reads OpenRouter's HTTP stream with Node's native
   fetch() + ReadableStream and re-emits a normalized, sanitized
   SSE protocol to the browser. Raw provider events are NEVER
   forwarded; provider errors are mapped through the existing
   error-sanitizing system.
   =========================================================== */

import {
    readUpstreamJson,
    handleUpstreamError,
    UpstreamHttpError,
    GENERIC_SERVER_ERROR
} from "./upstreamErrors.js";

const DEFAULT_UPSTREAM_URL = "https://openrouter.ai/api/v1/chat/completions";

/* ===========================================================
   HISTORY SANITIZATION
   Client-supplied history is untrusted. We strip any entry that
   is not a plain {role, content} object with a whitelisted role
   to prevent system-prompt injection via crafted history arrays.
   =========================================================== */

const ALLOWED_HISTORY_ROLES = new Set(["user", "assistant"]);
const MAX_HISTORY_ENTRIES = 50;

export function sanitizeHistory(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw
        .filter(entry =>
            entry !== null &&
            typeof entry === "object" &&
            !Array.isArray(entry) &&
            ALLOWED_HISTORY_ROLES.has(entry.role) &&
            typeof entry.content === "string" &&
            entry.content.trim() !== ""
        )
        .slice(-MAX_HISTORY_ENTRIES);
}

/* ===========================================================
   SSE PROTOCOL FORMATTER
   =========================================================== */

export function formatSSE(event, payload) {
    return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/* ===========================================================
   SSE LINE PARSER
   Handles events split across network reads and UTF-8 multi-byte
   boundaries. Returns every complete "data: <payload>" of the
   normalized provider stream; ignores comments (": ..." lines).
   =========================================================== */

export function createSSEParser() {
    let buffer = "";
    const decoder = new TextDecoder("utf-8");

    const dataFromBlock = block => {
        const dataLines = [];
        for (let line of block.split("\n")) {
            if (line.endsWith("\r")) {
                line = line.slice(0, -1);
            }
            if (!line || line.startsWith(":")) {
                continue;
            }
            if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).replace(/^ /, ""));
            }
        }
        return dataLines.length > 0 ? dataLines.join("\n") : null;
    };

    return {
        push(chunk) {
            const bytes = typeof chunk === "string"
                ? new TextEncoder().encode(chunk)
                : chunk;
            buffer += decoder.decode(bytes, { stream: true });
            buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            const payloads = [];
            let index;
            while ((index = buffer.indexOf("\n\n")) !== -1) {
                const block = buffer.slice(0, index);
                buffer = buffer.slice(index + 2);
                const payload = dataFromBlock(block);
                if (payload !== null) {
                    payloads.push(payload);
                }
            }
            return payloads;
        },
        flush() {
            buffer += decoder.decode();
            const remaining = buffer;
            buffer = "";
            if (!remaining.trim()) {
                return null;
            }
            return dataFromBlock(remaining);
        }
    };
}

/* ===========================================================
   DELTA EXTRACTOR
   OpenRouter streams OpenAI-style chunks. We extract ONLY
   choices[0].delta.content. Everything else (errors, [DONE],
   role-only chunks) is reduced to a closed set of outcomes.
   =========================================================== */

export function extractDeltaContent(payload) {

    if (payload === "[DONE]") {
        return { done: true };
    }

    let parsed;

    try {
        parsed = JSON.parse(payload);
    } catch {
        return { error: true };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { error: true };
    }

    if (parsed.error) {
        return { error: true };
    }

    const delta = parsed.choices?.[0]?.delta?.content;

    if (typeof delta === "string" && delta) {
        return { delta };
    }

    return { delta: "" };
}

/* ===========================================================
   MAIN HANDLER
   Receives an already-authenticated, rate-limited Express
   request. Writes a normalized SSE response:
     event: delta   data: {"delta":"..."}
     event: error   data: {"error":"<sanitized message>"}
     event: done    data: {}
   Never throws: all failure modes are routed to a sanitized SSE
   error event (or silently dropped when the client is gone).
   =========================================================== */

export async function handleStreamChat(req, res, options = {}) {

    const {
        openrouterKey,
        systemPrompt = "",
        fetchImpl = fetch,
        upstreamUrl = DEFAULT_UPSTREAM_URL,
        timeoutMs = 60000,
        model = "openai/gpt-4o-mini",
        temperature = 0.7,
        maxTokens = 2048
    } = options;

    const { message, history = [] } = req.body || {};

    if (!message || !message.trim()) {
        return res.status(400).json({
            success: false,
            error: "Message is required."
        });
    }

    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    });

    res.flushHeaders();

    const controller = new AbortController();

    let clientClosed = false;
    let settled = false;
    let idleTimer = null;

    const armIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), timeoutMs);
    };

    const cleanup = () => {
        if (settled) {
            return;
        }
        settled = true;
        clearTimeout(idleTimer);
        if (req.off) {
            req.off("close", onClientClose);
        }
    };

    // Client socket closed: stop everything silently. Any upstream
    // fetch still in flight is aborted so no request is left
    // running after the client is gone.
    const onClientClose = () => {
        clientClosed = true;
        cleanup();
        if (!controller.signal.aborted) {
            controller.abort();
        }
    };

    const send = (event, payload) => {
        if (clientClosed || res.destroyed || res.writableEnded) {
            return false;
        }
        try {
            res.write(formatSSE(event, payload));
            return true;
        } catch {
            return false;
        }
    };

    const errorEvent = error => {
        if (clientClosed) {
            return false;
        }
        const safe = handleUpstreamError(error);
        return send("error", { error: safe.message });
    };

    const finish = () => {
        cleanup();
        if (!clientClosed && !res.destroyed && !res.writableEnded) {
            try {
                res.end();
            } catch {
                // Client already gone; nothing to flush.
            }
        }
    };

    // Turn a failed upstream HTTP response into a sanitized message.
    const upstreamFailureMessage = async response => {
        let failure = new UpstreamHttpError(response.status, "Upstream request failed");
        try {
            await readUpstreamJson(response);
        } catch (error) {
            failure = error instanceof UpstreamHttpError
                ? error
                : new UpstreamHttpError(response.status, "Upstream request failed");
        }
        return handleUpstreamError(failure).message;
    };

    if (req.on) {
        req.on("close", onClientClose);
    }

    armIdleTimer();

    let response;

    try {
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

    if (clientClosed) {
        cleanup();
        return;
    }

    if (!response.ok) {
        const safeMessage = await upstreamFailureMessage(response);
        send("error", { error: safeMessage });
        finish();
        return;
    }

    if (!response.body) {
        send("done", {});
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

            armIdleTimer();

            if (clientClosed) {
                break;
            }

            for (const payload of parser.push(result.value)) {

                if (clientClosed) {
                    break;
                }

                const parsed = extractDeltaContent(payload);

                if (parsed.done) {
                    sawDone = true;
                    send("done", {});
                    break;
                }

                if (parsed.error) {
                    stopped = true;
                    send("error", { error: GENERIC_SERVER_ERROR });
                    break;
                }

                if (parsed.delta) {
                    armIdleTimer();
                    send("delta", { delta: parsed.delta });
                }
            }

            if (sawDone || stopped || clientClosed) {
                break;
            }
        }

        if (!sawDone && !stopped && !clientClosed) {

            // Drain any final buffered event (no trailing blank line)
            // or finalize an empty/truncated stream as done.
            const trailing = parser.flush();

            if (trailing === null) {
                send("done", {});
            } else {
                const parsed = extractDeltaContent(trailing);
                if (parsed.done) {
                    send("done", {});
                } else if (parsed.error) {
                    send("error", { error: GENERIC_SERVER_ERROR });
                } else if (parsed.delta) {
                    send("delta", { delta: parsed.delta });
                    send("done", {});
                }
            }
        }

    } catch (error) {
        errorEvent(error);
    } finally {
        finish();
    }
}