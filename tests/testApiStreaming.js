/* ===========================================================
   Tests for js/api.js streamMessage(): frontend SSE streaming
   API layer.

   Uses a mocked fetch + ReadableStream bodies; no real network
   requests are made. Verifies the Phase 2 API-layer contract:

   - POST /api/chat with stream:true and the message/history body
   - normalized SSE parsing (delta / done / error)
   - multi-event reads, split reads, UTF-8 boundaries
   - sanitized failures only (provider internals never surface)
   - AbortController cancellation is not an API error
   - empty streams and streams ending without done are handled
=========================================================== */

import { API } from "../js/api.js";


const ENDPOINT = "https://example.test/api/chat";


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


const deltaSSE = text => `event: delta\ndata: ${JSON.stringify({ delta: text })}\n\n`;

const doneSSE = () => "event: done\ndata: {}\n\n";

const errorSSE = message => `event: error\ndata: ${JSON.stringify({ error: message })}\n\n`;


function streamBody(chunks, { signal = null } = {}) {

    return new ReadableStream({

        start(controller) {

            for (const chunk of chunks) {
                controller.enqueue(
                    typeof chunk === "string" ? enc.encode(chunk) : chunk
                );
            }

            if (signal) {
                signal.addEventListener("abort", () =>
                    controller.error(new DOMException("Aborted", "AbortError"))
                );
                if (!signal.aborted) {
                    return;
                }
            }

            controller.close();

        }

    });

}


function mockResponse(body, { status = 200, ok = true, contentType = "text/event-stream" } = {}) {

    return {
        ok,
        status,
        headers: { get: name => (name === "content-type" ? contentType : null) },
        body
    };

}


function mockErrorResponse(status, bodyText, contentType = "application/json") {

    return {
        ok: false,
        status,
        headers: { get: name => (name === "content-type" ? contentType : null) },
        body: null,
        async json() { return JSON.parse(bodyText); },
        async text() { return bodyText; }
    };

}


function makeApi(controller = null) {

    const api = new API();

    api.configure({ endpoint: ENDPOINT });

    if (controller) {
        api.controller = controller;
    }

    return api;

}


async function expectThrows(promise) {

    try {
        await promise;
        return null;
    }
    catch (error) {
        return error;
    }

}


const toBytes = str => enc.encode(str);


/* -----------------------------------------------------------
   1 + 2. POSTs with stream:true and the message/history body.
----------------------------------------------------------- */

async function testPostsStreamingBody() {

    const calls = [];

    const api = makeApi();

    globalThis.fetch = async (url, options) => {

        calls.push({ url, options });

        return mockResponse(streamBody([deltaSSE("Hi"), doneSSE()]));

    };

    let deltas = 0;
    let doneContent = null;

    const result = await api.streamMessage("hello there", [
        { role: "user", content: "prev" }
    ], {
        onDelta: () => { deltas += 1; },
        onDone: content => { doneContent = content; }
    });

    assert(
        "T1 streamMessage POSTs to /api/chat",
        calls.length === 1 &&
        calls[0].url === ENDPOINT &&
        calls[0].options.method === "POST"
    );

    assert(
        "T1 body carries stream:true",
        JSON.parse(calls[0].options.body).stream === true
    );

    assert(
        "T2 body carries the user message",
        JSON.parse(calls[0].options.body).message === "hello there"
    );

    assert(
        "T2 body carries the history payload",
        JSON.stringify(JSON.parse(calls[0].options.body).history) ===
        JSON.stringify([{ role: "user", content: "prev" }])
    );

    assert(
        "T2 JSON content-type header only (no client token)",
        calls[0].options.headers["Content-Type"] === "application/json" &&
        !calls[0].options.headers["Authorization"]
    );

    assert(
        "T2 one delta and clean done",
        deltas === 1 && doneContent === "Hi"
    );

    assert(
        "T2 streamMessage returns the content",
        result === "Hi"
    );

}


/* -----------------------------------------------------------
   3 + 4 + 5. One delta, multiple deltas in order, concatenation.
----------------------------------------------------------- */

async function testDeltasAndConcatenation() {

    const api = makeApi();

    globalThis.fetch = async (_url, _options) => mockResponse(
        streamBody([deltaSSE("Hello"), deltaSSE(", "), deltaSSE("World")])
    );

    const deltas = [];
    let doneContent = null;

    await api.streamMessage("hi", [], {
        onDelta: d => { deltas.push(d); },
        onDone: content => { doneContent = content; }
    });

    assert(
        "T4 multiple deltas arrive in order",
        JSON.stringify(deltas) === JSON.stringify(["Hello", ", ", "World"])
    );

    assert(
        "T5 deltas concatenate correctly",
        doneContent === "Hello, World"
    );

}


/* -----------------------------------------------------------
   6. The normalized 'done' event finishes the stream.
----------------------------------------------------------- */

async function testDoneEvent() {

    const api = makeApi();

    globalThis.fetch = async (_url, _options) => mockResponse(
        streamBody([": heartbeat\n\n", deltaSSE("pong"), doneSSE()])
    );

    const deltas = [];
    let doneCount = 0;
    let doneContent = null;

    await api.streamMessage("ping", [], {
        onDelta: d => { deltas.push(d); },
        onDone: content => { doneCount += 1; doneContent = content; }
    });

    assert(
        "T6 comments are ignored and delta still delivered",
        JSON.stringify(deltas) === JSON.stringify(["pong"])
    );

    assert(
        "T6 done fired exactly once with full content",
        doneCount === 1 && doneContent === "pong"
    );

}


/* -----------------------------------------------------------
   7. One SSE event split across two reads.
----------------------------------------------------------- */

async function testSplitAcrossReads() {

    const full = deltaSSE("split ok") + doneSSE();

    const mid = full.length >> 1;

    const api = makeApi();

    globalThis.fetch = async (_url, _options) => mockResponse(
        streamBody([full.slice(0, mid), full.slice(mid)])
    );

    let doneContent = null;

    await api.streamMessage("hi", [], {
        onDelta: () => {},
        onDone: content => { doneContent = content; }
    });

    assert(
        "T7 event split across reads reassembles",
        doneContent === "split ok"
    );

}


/* -----------------------------------------------------------
   8. UTF-8 characters split across reads.
----------------------------------------------------------- */

async function testUtf8SplitAcrossReads() {

    const full = deltaSSE("ہیلو دنیا") + doneSSE();

    const bytes = toBytes(full);

    const mid = bytes.length >> 1;

    const api = makeApi();

    globalThis.fetch = async (_url, _options) => mockResponse(
        streamBody([bytes.slice(0, mid), bytes.slice(mid)])
    );

    let doneContent = null;

    await api.streamMessage("hi", [], {
        onDelta: () => {},
        onDone: content => { doneContent = content; }
    });

    assert(
        "T8 UTF-8 split across reads decodes cleanly",
        doneContent === "ہیلو دنیا"
    );

}


/* -----------------------------------------------------------
   9. Multiple events delivered in a single read.
----------------------------------------------------------- */

async function testMultipleEventsOneRead() {

    const chunk = deltaSSE("A") + deltaSSE("B") + doneSSE();

    const api = makeApi();

    globalThis.fetch = async (_url, _options) => mockResponse(
        streamBody([chunk])
    );

    const deltas = [];
    let doneContent = null;

    await api.streamMessage("hi", [], {
        onDelta: d => { deltas.push(d); },
        onDone: content => { doneContent = content; }
    });

    assert(
        "T9 multiple events in one read parse in order",
        JSON.stringify(deltas) === JSON.stringify(["A", "B"]) &&
        doneContent === "AB"
    );

}


/* -----------------------------------------------------------
   10. Server error event calls onError with the sanitized text.
----------------------------------------------------------- */

async function testServerErrorEvent() {

    const api = makeApi();

    globalThis.fetch = async (_url, _options) => mockResponse(
        streamBody([errorSSE("The provider is rate-limited. Please try again shortly.")])
    );

    let errorMessage = null;
    let doneCalled = false;
    let result = "unset";

    result = await api.streamMessage("hi", [], {
        onDelta: () => {},
        onDone: () => { doneCalled = true; },
        onError: error => { errorMessage = error.message; }
    });

    assert(
        "T10 error callback receives the server's sanitized message",
        errorMessage === "The provider is rate-limited. Please try again shortly."
    );

    assert(
        "T10 done is not called after an error event",
        doneCalled === false
    );

    assert(
        "T10 streamMessage resolves (does not throw) after error event",
        result === ""
    );

}


/* -----------------------------------------------------------
   11. Malformed stream JSON fails safely with a generic error.
----------------------------------------------------------- */

async function testMalformedJson() {

    const api = makeApi();

    globalThis.fetch = async (_url, _options) => mockResponse(
        streamBody([`event: delta\ndata: {"delta":broken\n\n`])
    );

    let errorMessage = null;

    const result = await api.streamMessage("hi", [], {
        onDelta: () => {},
        onError: error => { errorMessage = error.message; }
    });

    assert(
        "T11 malformed JSON yields a generic error",
        /invalid data/.test(errorMessage || "")
    );

    assert(
        "T11 raw malformed body is never surfaced",
        errorMessage && !errorMessage.includes("broken")
    );

    assert(
        "T11 resolves with partial (empty) content",
        result === ""
    );

}


/* -----------------------------------------------------------
   12. Stream ending without 'done' finishes gracefully.
----------------------------------------------------------- */

async function testEndsWithoutDone() {

    const api = makeApi();

    globalThis.fetch = async (_url, _options) => mockResponse(
        streamBody([deltaSSE("partial")])
    );

    let doneContent = null;
    let errors = 0;

    await api.streamMessage("hi", [], {
        onDelta: () => {},
        onDone: content => { doneContent = content; },
        onError: () => { errors += 1; }
    });

    assert(
        "T12 stream ending without done still completes the listener",
        doneContent === "partial" && errors === 0
    );

}


/* -----------------------------------------------------------
   13. Empty stream produces done with empty content.
----------------------------------------------------------- */

async function testEmptyStream() {

    const api = makeApi();

    globalThis.fetch = async (_url, _options) => mockResponse(
        streamBody([])
    );

    let doneContent = "unset";
    let deltas = 0;

    await api.streamMessage("hi", [], {
        onDelta: () => { deltas += 1; },
        onDone: content => { doneContent = content; }
    });

    assert(
        "T13 empty stream triggers done with empty content",
        doneContent === "" && deltas === 0
    );

}


/* -----------------------------------------------------------
   14. HTTP 401 / 4xx / 5xx before streaming.
----------------------------------------------------------- */

async function testHttpErrorsBeforeStream() {

    const cases = [
        { status: 401, body: '{"success":false,"error":"Authentication failed. Please log in again."}' },
        { status: 429, body: '{"success":false,"error":"Too many requests. Please wait a moment and try again."}' },
        { status: 500, body: '{"success":false,"error":"The server is temporarily unavailable. Please try again."}' }
    ];

    for (const { status, body } of cases) {

        const api = makeApi();

        globalThis.fetch = async (_url, _options) => mockErrorResponse(status, body);

        let error = null;

        error = await expectThrows(
            api.streamMessage("hi", [], { onError: () => {} })
        );

        assert(
            `T14 HTTP ${status} rejects with APIError`,
            error && error.name === "APIError" && error.status === status
        );

        const serverMessage = JSON.parse(body).error;

        assert(
            `T14 HTTP ${status} surfaces the server's sanitized message`,
            error && error.message === serverMessage
        );

    }

    const api = makeApi();

    globalThis.fetch = async () =>
    mockErrorResponse(502, "<html>Bad Gateway</html>", "text/html");

    const error = await expectThrows(
        api.streamMessage("hi", [], { onError: () => {} })
    );

    assert(
        "T14 non-JSON 5xx handled without SyntaxError",
        error && error.name === "APIError" &&
        !(error instanceof SyntaxError)
    );

    assert(
        "T14 raw HTML body never surfaced",
        error && !error.message.includes("<html>")
    );

}


/* -----------------------------------------------------------
   15. AbortController cancellation is not an API error.
----------------------------------------------------------- */

async function testAbortCancellation() {

    const calls = [];

    const controller = new AbortController();

    const api = makeApi(controller);

    globalThis.fetch = async (url, options) => {

        calls.push(options.signal === controller.signal);

        return mockResponse(
            streamBody([deltaSSE("Hel")], { signal: options.signal })
        );

    };

    const deltas = [];
    const errors = [];
    let doneCalled = false;

    const promise = api.streamMessage("hi", [], {
        onDelta: d => { deltas.push(d); },
        onDone: () => { doneCalled = true; },
        onError: err => { errors.push(err); }
    });

    await new Promise(resolve => setTimeout(resolve, 20));

    controller.abort();

    const result = await promise;

    assert(
        "T15 AbortSignal was passed to fetch",
        calls.length === 1 && calls[0] === true
    );

    assert(
        "T15 delta before cancel is delivered",
        JSON.stringify(deltas) === JSON.stringify(["Hel"])
    );

    assert(
        "T15 cancel is not reported as an API error",
        errors.length === 0 && doneCalled === false
    );

    assert(
        "T15 streamMessage resolves (does not reject) on cancel",
        result === "Hel"
    );

}


/* -----------------------------------------------------------
   16. Provider/internal error text is never surfaced.
----------------------------------------------------------- */

async function testInternalsNeverSurface() {

    const api = makeApi();

    globalThis.fetch = async (_url, _options) => mockResponse(
        streamBody([errorSSE("sk-or-provider-internal-secret-abc")])
    );

    let errorMessage = null;

    await api.streamMessage("hi", [], {
        onError: error => { errorMessage = error.message; }
    });

    assert(
        "T16 provider secret in error event is replaced with generic text",
        errorMessage === "Stream failed. Please try again." &&
        !errorMessage.includes("sk-") &&
        !errorMessage.includes("secret")
    );

    const api2 = makeApi();

    globalThis.fetch = async (_url, _options) => mockErrorResponse(
        500,
        '{"success":false,"error":"internal sk-or-xyz occurred /server/crash.js:12"}'
    );

    const error = await expectThrows(
        api2.streamMessage("hi", [], { onError: () => {} })
    );

    assert(
        "T16 HTTP error with internals falls back to clean message",
        error && !error.message.includes("sk-") &&
        !error.message.includes("crash") &&
        !error.message.includes("occurred") &&
        !error.message.includes("xyz") &&
        !!error.status
    );

}


await testPostsStreamingBody();

await testDeltasAndConcatenation();

await testDoneEvent();

await testSplitAcrossReads();

await testUtf8SplitAcrossReads();

await testMultipleEventsOneRead();

await testServerErrorEvent();

await testMalformedJson();

await testEndsWithoutDone();

await testEmptyStream();

await testHttpErrorsBeforeStream();

await testAbortCancellation();

await testInternalsNeverSurface();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}