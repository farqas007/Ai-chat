/* ===========================================================
   Regression tests — BUG-3: streamMessage HTTP failures must
   trigger exactly one failStream() (one onError + one api:error).

   Before BUG-3 the non-OK HTTP branch called failStream() and
   then threw into a catch that called failStream() again, so
   onError and api:error each fired twice.

   After BUG-3 a single HTTP failure produces exactly one of each,
   while success, network-error and abort behavior are unchanged.
=========================================================== */

import { API } from "../js/api.js";
import Events from "../js/events.js";


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


function streamBody(chunks, { signal = null } = {}) {

    return new ReadableStream({

        start(controller) {

            for (const chunk of chunks) {
                controller.enqueue(enc.encode(chunk));
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


function createApi(fetchImpl) {

    globalThis.fetch = fetchImpl;

    const api = new API();

    api.configure({ endpoint: ENDPOINT });

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


/* -----------------------------------------------------------
   T1 — each HTTP error status fires onError/api:error once.
----------------------------------------------------------- */

async function testHttpErrorFiresOnce() {

    const cases = [
        { status: 400, body: { success: false, error: "bad request" } },
        { status: 401, body: { success: false, error: "Authentication failed. Please log in again." } },
        { status: 429, body: { success: false, error: "Too many requests. Please wait a moment and try again." } },
        { status: 500, body: { success: false, error: "The server is temporarily unavailable. Please try again." } }
    ];

    for (const { status, body } of cases) {

        Events.clear();

        let onErrorCalls = 0;
        let apiErrorEvents = 0;

        Events.on("api:error", () => { apiErrorEvents += 1; });

        const api = createApi(async () =>
            mockErrorResponse(status, JSON.stringify(body))
        );

        const error = await expectThrows(
            api.streamMessage("hi", [], {
                onError: () => { onErrorCalls += 1; }
            })
        );

        assert(
            `T1 HTTP ${status} onError fired exactly once`,
            onErrorCalls === 1
        );

        assert(
            `T1 HTTP ${status} api:error emitted exactly once`,
            apiErrorEvents === 1
        );

        assert(
            `T1 HTTP ${status} still rejects with APIError`,
            error && error.name === "APIError" && error.status === status
        );

    }

}


/* -----------------------------------------------------------
   T2 — non-JSON 5xx still fires exactly once (no SyntaxError).
----------------------------------------------------------- */

async function testNonJsonHttpErrorFiresOnce() {

    Events.clear();

    let onErrorCalls = 0;
    let apiErrorEvents = 0;

    Events.on("api:error", () => { apiErrorEvents += 1; });

    const api = createApi(async () =>
        mockErrorResponse(502, "<html>Bad Gateway</html>", "text/html")
    );

    const error = await expectThrows(
        api.streamMessage("hi", [], {
            onError: () => { onErrorCalls += 1; }
        })
    );

    assert(
        "T2 non-JSON 5xx onError fired exactly once",
        onErrorCalls === 1
    );

    assert(
        "T2 non-JSON 5xx api:error emitted exactly once",
        apiErrorEvents === 1
    );

    assert(
        "T2 non-JSON 5xx throws APIError, not SyntaxError",
        error && error.name === "APIError" &&
        !(error instanceof SyntaxError)
    );

}


/* -----------------------------------------------------------
   T3 — network errors fire exactly once.
----------------------------------------------------------- */

async function testNetworkErrorFiresOnce() {

    Events.clear();

    let onErrorCalls = 0;
    let apiErrorEvents = 0;

    Events.on("api:error", () => { apiErrorEvents += 1; });

    const api = createApi(async () => {
        throw new TypeError("fetch failed");
    });

    const error = await expectThrows(
        api.streamMessage("hi", [], {
            onError: () => { onErrorCalls += 1; }
        })
    );

    assert(
        "T3 network error onError fired exactly once",
        onErrorCalls === 1
    );

    assert(
        "T3 network error api:error emitted exactly once",
        apiErrorEvents === 1
    );

    assert(
        "T3 network error rejects",
        !!error
    );

}


/* -----------------------------------------------------------
   T4 — normal SSE success is unaffected.
----------------------------------------------------------- */

async function testSuccessUnaffected() {

    Events.clear();

    let onErrorCalls = 0;
    let doneContent = "unset";

    const api = createApi(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "text/event-stream" },
        body: streamBody([deltaSSE("Hi"), doneSSE()])
    }));

    const result = await api.streamMessage("hi", [], {
        onDelta: () => {},
        onDone: content => { doneContent = content; },
        onError: () => { onErrorCalls += 1; }
    });

    assert(
        "T4 success still resolves with content and done",
        result === "Hi" && doneContent === "Hi"
    );

    assert(
        "T4 success never calls onError",
        onErrorCalls === 0
    );

}


/* -----------------------------------------------------------
   T5 — abort is not an API error (behavior preserved).
----------------------------------------------------------- */

async function testAbortUnaffected() {

    Events.clear();

    const controller = new AbortController();

    let onErrorCalls = 0;

    const api = createApi(async (_url, options) => ({
        ok: true,
        status: 200,
        headers: { get: () => "text/event-stream" },
        body: streamBody([deltaSSE("Hel")], { signal: options.signal })
    }));

    api.controller = controller;

    const promise = api.streamMessage("hi", [], {
        onDelta: () => {},
        onError: () => { onErrorCalls += 1; }
    });

    await new Promise(resolve => setTimeout(resolve, 20));

    controller.abort();

    const result = await promise;

    assert(
        "T5 abort does not call onError",
        onErrorCalls === 0
    );

    assert(
        "T5 abort resolves with partial content",
        result === "Hel"
    );

}


await testHttpErrorFiresOnce();

await testNonJsonHttpErrorFiresOnce();

await testNetworkErrorFiresOnce();

await testSuccessUnaffected();

await testAbortUnaffected();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}
