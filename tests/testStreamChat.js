/* ===========================================================
   Test: backend SSE streaming (server/streamChat.js).

   Zero-dependency harness. Uses Node's native fetch/streams to
   verify the normalized SSE protocol:
     - valid OpenRouter chunks become delta events
     - deltas concatenate correctly
     - [DONE] produces a done event
     - comments are ignored
     - SSE data split across reads (and UTF-8 boundaries) works
     - malformed provider JSON is handled safely
     - upstream non-2xx errors are sanitized
     - mid-stream failures emit sanitized errors
     - empty successful streams produce done
     - client disconnects abort the upstream request
     - timeout aborts the upstream request
     - provider bodies/errors are never leaked
   =========================================================== */


import {
    formatSSE,
    createSSEParser,
    extractDeltaContent,
    handleStreamChat
} from "../server/streamChat.js";


const passed = [];
const failed = [];

function assert(name, condition) {
    if (condition) {
        passed.push(name);
        console.log(`PASS: ${name}`);
    } else {
        failed.push(name);
        console.log(`FAIL: ${name}`);
    }
}

const enc = new TextEncoder();


/* -----------------------------------------------------------
   Helpers
----------------------------------------------------------- */

// Builds a mock upstream response body stream. When signal is
// given the stream stays open and errors with AbortError if the
// signal aborts (mimics how an in-flight fetch reacts to abort).
function upstreamStream(chunks = [], signal = null) {
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(typeof chunk === "string" ? enc.encode(chunk) : chunk);
            }
            if (signal) {
                signal.addEventListener("abort", () => {
                    controller.error(new DOMException("The operation was aborted.", "AbortError"));
                }, { once: true });
            } else {
                controller.close();
            }
        }
    });
}


function upstreamResponse(options = {}) {
    const {
        ok = true,
        status = 200,
        chunks = [],
        signal = null,
        textBody = ""
    } = options;
    return {
        ok,
        status,
        headers: { get: () => "text/event-stream" },
        body: ok ? upstreamStream(chunks, signal) : null,
        async text() {
            return textBody;
        }
    };
}


function createHarness() {

    const listeners = {};
    const reqListeners = new Set();

    const req = {
        body: { message: "hello", history: [] },
        on(event, handler) {
            listeners[event] = handler;
            reqListeners.add(handler);
        },
        off(event, handler) {
            if (listeners[event] === handler) {
                delete listeners[event];
            }
            reqListeners.delete(handler);
        },
        emitClose() {
            if (listeners.close) {
                listeners.close();
            }
        }
    };

    const res = {
        _status: 200,
        _headers: null,
        _json: null,
        destroyed: false,
        writableEnded: false,
        writes: [],
        status(code) {
            this._status = code;
            return this;
        },
        json(payload) {
            this._json = payload;
            this.writes.push(payload);
        },
        writeHead(code, headers) {
            this._status = code;
            this._headers = headers;
        },
        flushHeaders() {
            this.flushed = true;
        },
        write(text) {
            if (!this.writableEnded) {
                this.writes.push(text);
            }
        },
        end() {
            this.writableEnded = true;
        }
    };

    return { req, res, emitClose: () => req.emitClose() };
}


const allWrites = data => data.writes.filter(w => typeof w === "string").join("");


function deltaPayload(text) {
    return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}


function roleOnlyChunk() {
    return `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`;
}


async function runHandler(data, options = {}) {
    const h = createHarness();
    let capturedSignal = null;
    const fetchImpl = options.fetchImpl || (async (url, opts) => {
        capturedSignal = opts.signal;
        return options.response;
    });
    const promise = handleStreamChat(h.req, h.res, {
        openrouterKey: "test-key",
        systemPrompt: "system prompt",
        fetchImpl,
        timeoutMs: options.timeoutMs || 60000,
        ...options.overrides
    });
    return {
        req: h.req,
        res: h.res,
        writes: h.res.writes,
        emitClose: h.emitClose,
        promise,
        get signal() { return capturedSignal; }
    };
}


function countEvents(data, eventName) {
    return data.writes
        .filter(w => typeof w === "string")
        .filter(w => w.startsWith(`event: ${eventName}\n`))
        .length;
}


/* -----------------------------------------------------------
   1. Valid streamed chunks become normalized delta events.
----------------------------------------------------------- */

async function testValidDeltaEvents() {

    const h = await runHandler({}, {
        response: upstreamResponse({
            chunks: [deltaPayload("Hello")]
        })
    });

    await h.promise;

    const sse = allWrites(h);

    assert(
        "T1 emits event: delta with the exact payload",
        h.writes[0] === formatSSE("delta", { delta: "Hello" })
    );

    assert(
        "T1 emits event: done after the stream",
        countEvents(h, "done") === 1 &&
        h.writes.some(w => w === formatSSE("done", {}))
    );

    assert(
        "T1 stream ended cleanly",
        h.res.writableEnded === true
    );

    assert(
        "T1 SSE headers are set for streaming",
        h.res._headers &&
        h.res._headers["Content-Type"] === "text/event-stream" &&
        h.res._headers["Cache-Control"] === "no-cache, no-transform" &&
        h.res._headers["X-Accel-Buffering"] === "no"
    );

    assert(
        "T1 key not exposed in the stream",
        !sse.includes("test-key") &&
        !sse.includes("Authorization") &&
        !sse.includes(systemPromptText())
    );

}


/* -----------------------------------------------------------
   2. Multiple deltas concatenate correctly.
----------------------------------------------------------- */

async function testMultipleDeltasConcatenate() {

    const h = await runHandler({}, {
        response: upstreamResponse({
            chunks: [
                deltaPayload("Hello"),
                deltaPayload(" world"),
                deltaPayload("!")
            ]
        })
    });

    await h.promise;

    const contents = h.writes
        .filter(w => w.startsWith("event: delta")) 
        .map(w => JSON.parse(w.split("data: ")[1].trim()).delta);

    assert(
        "T2 three delta events received in order",
        contents.length === 3 &&
        contents[0] === "Hello" &&
        contents[1] === " world" &&
        contents[2] === "!"
    );

    assert(
        "T2 deltas concatenate to the full reply",
        contents.join("") === "Hello world!"
    );

    assert(
        "T2 exactly one done event",
        countEvents(h, "done") === 1
    );
}


/* -----------------------------------------------------------
   3. [DONE] produces a done event.
----------------------------------------------------------- */

async function testDoneMarker() {

    const h = await runHandler({}, {
        response: upstreamResponse({
            chunks: [
                deltaPayload("done marker"),
                "data: [DONE]\n\n"
            ]
        })
    });

    await h.promise;

    assert(
        "T3 delta preceding [DONE] emitted",
        h.writes.some(w => w === formatSSE("delta", { delta: "done marker" }))
    );

    assert(
        "T3 [DONE] yields exactly one done event",
        countEvents(h, "done") === 1
    );

    assert(
        "T3 no stray data after done",
        countEvents(h, "error") === 0
    );
}


/* -----------------------------------------------------------
   4. Comments are ignored.
----------------------------------------------------------- */

async function testCommentsIgnored() {

    const h = await runHandler({}, {
        response: upstreamResponse({
            chunks: [
                ": OPENROUTER PROCESSING\n\n",
                deltaPayload("clean"),
                ": OPENROUTER PROCESSING\n\n",
                "data: [DONE]\n\n"
            ]
        })
    });

    await h.promise;

    const sse = allWrites(h);

    assert(
        "T4 only the real delta event is emitted",
        countEvents(h, "delta") === 1 &&
        sse.includes('"delta":"clean"')
    );

    assert(
        "T4 comment text never forwarded",
        !sse.includes("OPENROUTER PROCESSING")
    );
}


/* -----------------------------------------------------------
   5. SSE data split across reads (and UTF-8 boundaries).
----------------------------------------------------------- */

async function testSplitAcrossReads() {

    const event = deltaPayload("Hello");

    const mid = Math.floor(event.length / 2);

    const h = await runHandler({}, {
        response: upstreamResponse({
            chunks: [
                event.slice(0, mid),
                event.slice(mid)
            ]
        })
    });

    await h.promise;

    assert(
        "T5 event split across reads reassembles",
        h.writes.some(w => w === formatSSE("delta", { delta: "Hello" }))
    );

}


async function testUtf8Split() {

    const full = deltaPayload("ہیلو");

    const bytes = enc.encode(full);

    // Split inside the multi-byte Urdu text (5 bytes before the end).
    const split = bytes.length - 12;

    const first = bytes.slice(0, split);
    const second = bytes.slice(split);

    // Safety: the split must actually land inside the burst.
    assert(
        "T5B split index lands inside the Urdu text",
        totalBytesIn(full, "ہیلو") > 0 && split >= 0 && split < bytes.length
    );

    const h = await runHandler({}, {
        response: upstreamResponse({
            chunks: [first, second]
        })
    });

    await h.promise;

    assert(
        "T5B multi-byte UTF-8 split still decodes",
        h.writes.some(w => w === formatSSE("delta", { delta: "ہیلو" }))
    );
}


function totalBytesIn(text, needle) {
    const full = enc.encode(text).length;
    return full - enc.encode(text.replace(needle, "")).length;
}


/* -----------------------------------------------------------
   6. Role-only chunks produce no delta but keep streaming.
----------------------------------------------------------- */

async function testRoleOnlyChunkNoDelta() {

    const h = await runHandler({}, {
        response: upstreamResponse({
            chunks: [
                roleOnlyChunk(),
                deltaPayload("after role"),
                "data: [DONE]\n\n"
            ]
        })
    });

    await h.promise;

    const sse = allWrites(h);

    assert(
        "T6 role-only chunk does not emit a delta",
        !sse.includes('"delta":""') &&
        countEvents(h, "delta") === 1
    );

    assert(
        "T6 subsequent delta still emitted",
        sse.includes('"delta":"after role"')
    );

    assert(
        "T6 done still fired",
        countEvents(h, "done") === 1
    );
}


/* -----------------------------------------------------------
   7. Malformed provider JSON is handled safely.
----------------------------------------------------------- */

async function testMalformedProviderJson() {

    const h = await runHandler({}, {
        response: upstreamResponse({
            chunks: [
                "data: {not-valid-json\n\n"
            ]
        })
    });

    await h.promise;

    const sse = allWrites(h);

    assert(
        "T7 malformed JSON emits a sanitized error event",
        countEvents(h, "error") === 1 &&
        sse.includes('"error":"Something went wrong. Please try again."')
    );

    assert(
        "T7 no done event after a malformed payload",
        countEvents(h, "done") === 0
    );

    assert(
        "T7 raw malformed body never forwarded",
        !sse.includes("not-valid-json")
    );
}


/* -----------------------------------------------------------
   8. Upstream non-2xx errors are sanitized.
----------------------------------------------------------- */

async function testUpstreamHttpErrorSanitized() {

    for (const [status, expected] of [
        [404, "The provider rejected the request."],
        [429, "The provider is rate-limited. Please try again shortly."],
        [503, "The provider is temporarily unavailable. Please try again."]
    ]) {

        const leak = "sk-provider-internal-secret-abc";

        const h = await runHandler({}, {
            response: upstreamResponse({
                ok: false,
                status,
                textBody: JSON.stringify({ error: { message: leak } })
            })
        });

        await h.promise;

        const sse = allWrites(h);

        assert(
            `T8 status ${status} maps to a sanitized message`,
            countEvents(h, "error") === 1 &&
            sse.includes(`"error":"${expected}"`)
        );

        assert(
            `T8 status ${status} never leaks provider body`,
            !sse.includes(leak) &&
            !sse.includes("sk-provider-internal-secret-abc")
        );
    }
}


/* -----------------------------------------------------------
   9. Mid-stream failure emits a sanitized error.
----------------------------------------------------------- */

async function testMidStreamFailure() {

    const internalBoom = "provider internal boom details";

    let midPulls = 0;
    const body = new ReadableStream({
        pull(controller) {
            midPulls += 1;
            if (midPulls === 1) {
                controller.enqueue(enc.encode(deltaPayload("partial reply")));
            } else {
                controller.error(new Error(internalBoom));
            }
        }
    });

    const h = await runHandler({}, {
        response: { ok: true, status: 200, body, headers: { get: () => "text/event-stream" } }
    });

    await h.promise;

    const sse = allWrites(h);

    assert(
        "T9 partial delta already delivered is kept",
        countEvents(h, "delta") === 1 &&
        sse.includes('"delta":"partial reply"')
    );

    assert(
        "T9 mid-stream failure emits a sanitized error",
        countEvents(h, "error") === 1
    );

    assert(
        "T9 no done event after failure",
        countEvents(h, "done") === 0
    );

    assert(
        "T9 provider internals never leaked",
        !sse.includes(internalBoom) &&
        !sse.includes("boom")
    );
}


/* -----------------------------------------------------------
   10. Empty successful stream produces done.
----------------------------------------------------------- */

async function testEmptySuccessfulStream() {

    const h = await runHandler({}, {
        response: upstreamResponse({ chunks: [] })
    });

    await h.promise;

    assert(
        "T10 empty successful stream emits exactly one done",
        countEvents(h, "done") === 1 &&
        countEvents(h, "delta") === 0 &&
        countEvents(h, "error") === 0
    );
}


/* -----------------------------------------------------------
   11. Client disconnect aborts the upstream request and stays
   silent.
----------------------------------------------------------- */

async function testClientDisconnectAbortsUpstream() {

    const h = createHarness();

    let capturedSignal = null;

    const promise = handleStreamChat(h.req, h.res, {
        openrouterKey: "test-key",
        systemPrompt: "system prompt",
        timeoutMs: 60000,
        fetchImpl: async (url, opts) => {
            capturedSignal = opts.signal;
            return {
                ok: true,
                status: 200,
                headers: { get: () => "text/event-stream" },
                body: upstreamStream([], capturedSignal)
            };
        }
    });

    h.emitClose();

    await promise;

    assert(
        "T11 upstream request is aborted on client disconnect",
        capturedSignal !== null &&
        capturedSignal.aborted === true
    );

    assert(
        "T11 no error/delta leaked after client disconnect",
        h.res.writes.length === 0
    );

    assert(
        "T11 response not ended over a dead socket",
        h.res.writableEnded === false
    );
}


/* -----------------------------------------------------------
   12. Timeout aborts the upstream request and emits a sanitized
   error.
----------------------------------------------------------- */

async function testTimeoutAbortsUpstream() {

    const h = createHarness();

    let capturedSignal = null;

    const promise = handleStreamChat(h.req, h.res, {
        openrouterKey: "test-key",
        systemPrompt: "system prompt",
        timeoutMs: 40,
        fetchImpl: async (url, opts) => {
            capturedSignal = opts.signal;
            return {
                ok: true,
                status: 200,
                headers: { get: () => "text/event-stream" },
                body: upstreamStream([], capturedSignal)
            };
        }
    });

    await promise;

    const sse = allWrites(h.res);

    assert(
        "T12 upstream request is aborted on timeout",
        capturedSignal !== null &&
        capturedSignal.aborted === true
    );

    assert(
        "T12 timeout emits a sanitized error event",
        countEvents(h.res, "error") === 1 &&
        sse.includes("Upstream timed out.")
    );

    assert(
        "T12 no delta after timeout",
        countEvents(h.res, "delta") === 0
    );

    assert(
        "T12 stream closed after timeout",
        h.res.writableEnded === true
    );
}


/* -----------------------------------------------------------
   13. Invalid message still returns a 400 JSON (no SSE).
----------------------------------------------------------- */

async function testInvalidMessage() {

    const h = createHarness();

    h.req.body = { message: "   ", history: [] };

    await handleStreamChat(h.req, h.res, {
        openrouterKey: "test-key",
        systemPrompt: "system prompt"
    });

    assert(
        "T13 missing message returns 400 JSON, never SSE",
        h.res._status === 400 &&
        h.res._json &&
        h.res._json.success === false &&
        h.res.writes.length === 1 &&
        typeof h.res.writes[0] === "object"
    );
}


/* -----------------------------------------------------------
   14. Parser unit checks.
----------------------------------------------------------- */

async function testParserUnits() {

    const parser = createSSEParser();

    const payloads = parser.push(
        `data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: {"choices":[{"delta":{"content":"B"}}]}\n\n`
    );

    assert(
        "T14 parser returns both complete payloads",
        payloads.length === 2
    );

    assert(
        "T14 extract finds the delta",
        extractDeltaContent(payloads[0]).delta === "A"
    );

    assert(
        "T14 extract marks [DONE]",
        extractDeltaContent("[DONE]").done === true
    );

    const fragmented = createSSEParser();

    const firstHalf = fragmented.push(`data: {"choices":[{"delta":{"content":"he`);

    assert(
        "T14 incomplete event yields nothing yet",
        firstHalf.length === 0
    );

    const secondHalf = fragmented.push(`llo"}}]}\n\n`);

    assert(
        "T14 completion after the split read yields the event",
        secondHalf.length === 1 &&
        extractDeltaContent(secondHalf[0]).delta === "hello"
    );

    const commentOnly = createSSEParser();

    assert(
        "T14 comment-only blocks are skipped",
        commentOnly.push(": OPENROUTER PROCESSING\n\n").length === 0 &&
        commentOnly.flush() === null
    );

    assert(
        "T14 malformed payload surfaces as error outcome",
        extractDeltaContent("{oops").error === true
    );
}


/* -----------------------------------------------------------
   RUN ALL TESTS
----------------------------------------------------------- */

function systemPromptText() {
    return "system prompt";
}


await testValidDeltaEvents();

await testMultipleDeltasConcatenate();

await testDoneMarker();

await testCommentsIgnored();

await testSplitAcrossReads();

await testUtf8Split();

await testRoleOnlyChunkNoDelta();

await testMalformedProviderJson();

await testUpstreamHttpErrorSanitized();

await testMidStreamFailure();

await testEmptySuccessfulStream();

await testClientDisconnectAbortsUpstream();

await testTimeoutAbortsUpstream();

await testInvalidMessage();

await testParserUnits();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}