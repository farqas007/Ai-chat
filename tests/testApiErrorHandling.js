/* ===========================================================
   Regression tests for API / error handling.

   F10: response status is checked before JSON is trusted; JSON
        and non-JSON error responses are handled safely (no
        SyntaxError from a failed parse).
   F11: sendWithRetry() actually retries — and ONLY for transient
        failures (network, 429, 5xx). 4xx/auth errors are never
        retried. Retries are bounded with backoff, and the POST
        body (message + history) is identical on every attempt so
        no duplicate user message can ever be created.
   B1 / S5 (server): upstream JSON/non-JSON responses are parsed
        safely and provider internals are never echoed verbatim.
=========================================================== */

import { API } from "../js/api.js";

import {
    readUpstreamJson,
    handleUpstreamError,
    UpstreamHttpError
} from "../server/upstreamErrors.js";


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


function mockResponse({ status, contentType = "application/json", body }) {

    const text = typeof body === "string" ? body : JSON.stringify(body);

    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => contentType },
        async json() { return JSON.parse(text); },
        async text() { return text; }
    };

}


function createApi(fetchImpl) {

    globalThis.fetch = fetchImpl;

    const api = new API();

    api.configure({ endpoint: "https://example.test/api/chat" });

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
   TEST 1 — Normal successful response.
----------------------------------------------------------- */

async function testNormalSuccess() {

    const calls = [];

    const api = createApi(async (url, opts) => {

        calls.push({ url, body: opts.body });

        return mockResponse({
            status: 200,
            body: { success: true, content: "hello reply" }
        });

    });

    const result = await api.sendWithRetry("hello", [], { retries: 2, delay: 1 });

    assert(
        "T1 sendWithRetry returns parsed content",
        result === "hello reply"
    );

    assert(
        "T1 exactly one HTTP request on success",
        calls.length === 1
    );

    assert(
        "T1 request body is message + history",
        JSON.parse(calls[0].body).message === "hello"
    );

}


/* -----------------------------------------------------------
   TEST 2 — JSON error response (500) is retried, then succeeds.
----------------------------------------------------------- */

async function testJsonErrorThenRetrySucceeds() {

    const calls = [];

    let first = true;

    const api = createApi(async () => {

        calls.push({});

        if (first) {
            first = false;
            return mockResponse({
                status: 500,
                body: { success: false, error: "boom" }
            });
        }

        return mockResponse({
            status: 200,
            body: { success: true, content: "recovered" }
        });

    });

    const result = await api.sendWithRetry("hi", [], { retries: 2, delay: 1 });

    assert(
        "T2 transient failure retried to success",
        result === "recovered"
    );

    assert(
        "T2 two requests were made",
        calls.length === 2
    );

}


/* -----------------------------------------------------------
   TEST 3 — Non-JSON error response is handled safely (no
   SyntaxError), and is still retried because it is 5xx.
----------------------------------------------------------- */

async function testNonJsonError() {

    const calls = [];

    const api = createApi(async () => {

        calls.push({});

        return mockResponse({
            status: 502,
            contentType: "text/plain",
            body: "<html>Bad Gateway</html>"
        });

    });

    const error = await expectThrows(
        api.sendWithRetry("hi", [], { retries: 1, delay: 1 })
    );

    assert(
        "T3 clean APIError thrown, not SyntaxError",
        error && error.name === "APIError" &&
        !(error instanceof SyntaxError)
    );

    assert(
        "T3 message is user-facing and clean",
        error && /temporarily unavailable/.test(error.message)
    );

    assert(
        "T3 attempted initial + retry",
        calls.length === 2
    );

}


/* -----------------------------------------------------------
   TEST 4 — 401/403 are NEVER retried.
----------------------------------------------------------- */

async function testAuthErrorsNotRetried() {

    for (const status of [401, 403]) {

        const calls = [];

        const api = createApi(async () => {

            calls.push({});

            return mockResponse({
                status,
                body: { success: false, error: "auth" }
            });

        });

        const error = await expectThrows(
            api.sendWithRetry("hi", [], { retries: 2, delay: 1 })
        );

        assert(
            `T4 ${status} throws APIError`,
            error && error.name === "APIError" && error.status === status
        );

        assert(
            `T4 ${status} not retried (single request)`,
            calls.length === 1
        );

    }

}


/* -----------------------------------------------------------
   TEST 5 — 400 client error is never retried.
----------------------------------------------------------- */

async function testClientErrorNotRetried() {

    const calls = [];

    const api = createApi(async () => {

        calls.push({});

        return mockResponse({
            status: 400,
            body: { success: false, error: "bad request" }
        });

    });

    const error = await expectThrows(
        api.sendWithRetry("hi", [], { retries: 2, delay: 1 })
    );

    assert(
        "T5 400 throws APIError",
        error && error.status === 400
    );

    assert(
        "T5 400 not retried",
        calls.length === 1
    );

}


/* -----------------------------------------------------------
   TEST 6 — 429 (rate limit) IS retried.
----------------------------------------------------------- */

async function testRateLimitRetried() {

    const calls = [];

    let first = true;

    const api = createApi(async () => {

        calls.push({});

        if (first) {
            first = false;
            return mockResponse({
                status: 429,
                body: { success: false, error: "slow down" }
            });
        }

        return mockResponse({
            status: 200,
            body: { success: true, content: "ok after 429" }
        });

    });

    const result = await api.sendWithRetry("hi", [], { retries: 2, delay: 1 });

    assert(
        "T6 429 retried and recovered",
        result === "ok after 429"
    );

    assert(
        "T6 two requests after 429 retry",
        calls.length === 2
    );

}


/* -----------------------------------------------------------
   TEST 7 — Retry exhaustion throws the last error (no loop).
----------------------------------------------------------- */

async function testRetryExhaustion() {

    const calls = [];

    const api = createApi(async () => {

        calls.push({});

        return mockResponse({
            status: 500,
            body: { success: false, error: "always down" }
        });

    });

    const error = await expectThrows(
        api.sendWithRetry("hi", [], { retries: 2, delay: 1 })
    );

    assert(
        "T7 exhaustion still throws APIError",
        error && error.name === "APIError"
    );

    assert(
        "T7 bounded retries (initial + 2 retries)",
        calls.length === 3
    );

}


/* -----------------------------------------------------------
   TEST 8 — Every retry resends the identical message/history
   body: no duplicate user message is ever created.
----------------------------------------------------------- */

async function testRetryBodyIdentical() {

    const bodies = [];

    let failures = 2;

    const api = createApi(async (url, opts) => {

        bodies.push(JSON.parse(opts.body));

        if (failures > 0) {
            failures--;
            return mockResponse({
                status: 500,
                body: { success: false, error: "transient" }
            });
        }

        return mockResponse({
            status: 200,
            body: { success: true, content: "done" }
        });

    });

    const history = [{ role: "user", content: "prev" }];

    const result = await api.sendWithRetry("same message", history, { retries: 3, delay: 1 });

    assert(
        "T8 succeeded after retries",
        result === "done"
    );

    assert(
        "T8 identical message on every attempt",
        bodies.every(b => b.message === "same message")
    );

    assert(
        "T8 identical history on every attempt",
        bodies.every(b =>
            JSON.stringify(b.history) === JSON.stringify(history)
        )
    );

    assert(
        "T8 only one user-entity was ever submitted per attempt",
        bodies.every(b => b.message === "same message" && !Array.isArray(b.userMessages))
    );

}


/* -----------------------------------------------------------
   TEST 9 — Server helpers: JSON success.
----------------------------------------------------------- */

async function testServerJsonSuccess() {

    const data = await readUpstreamJson({
        ok: true,
        status: 200,
        async text() { return JSON.stringify({ success: true, content: "x" }); }
    });

    assert(
        "T9 readUpstreamJson returns parsed JSON",
        data.success === true && data.content === "x"
    );

}


/* -----------------------------------------------------------
   TEST 10 — Server helpers: JSON error -> UpstreamHttpError.
----------------------------------------------------------- */

async function testServerJsonError() {

    const error = await readUpstreamJson({
        ok: false,
        status: 429,
        async text() { return JSON.stringify({ detail: "quota exceeded" }); }
    }).catch(e => e);

    assert(
        "T10 upstream error becomes UpstreamHttpError",
        error instanceof UpstreamHttpError
    );

    assert(
        "T10 status preserved",
        error.status === 429
    );

    const mapped = handleUpstreamError(error);

    assert(
        "T10 429 maps to clean rate-limit message",
        mapped.message.includes("rate-limited")
    );

}


/* -----------------------------------------------------------
   TEST 11 — Server helpers: NON-JSON error body parses safely.
----------------------------------------------------------- */

async function testServerNonJsonError() {

    const error = await readUpstreamJson({
        ok: false,
        status: 500,
        async text() { return "<html>Internal Server Error</html>"; }
    }).catch(e => e);

    assert(
        "T11 non-JSON upstream becomes UpstreamHttpError, not SyntaxError",
        error instanceof UpstreamHttpError &&
        !(error instanceof SyntaxError)
    );

    const mapped = handleUpstreamError(error);

    assert(
        "T11 500 maps to clean temporary-unavailable message",
        mapped.status === 500 &&
        mapped.message.includes("temporarily unavailable")
    );

}


/* -----------------------------------------------------------
   TEST 12 — Server helpers: network/timeout errors sanitized.
----------------------------------------------------------- */

async function testServerTimeoutAndNetworkErrors() {

    const timeout = { name: "TimeoutError", message: "Timeout" };

    const mappedTimeout = handleUpstreamError(timeout);

    assert(
        "T12 timeout maps to 504",
        mappedTimeout.status === 504
    );

    const network = new TypeError("fetch failed");

    const mappedNetwork = handleUpstreamError(network);

    assert(
        "T12 network maps to 502",
        mappedNetwork.status === 502
    );

    assert(
        "T12 no internals leaked in messages",
        !mappedTimeout.message.includes("process") &&
        !mappedNetwork.message.includes("/server/") &&
        !mappedNetwork.message.includes("fetch failed")
    );

}


await testNormalSuccess();

await testJsonErrorThenRetrySucceeds();

await testNonJsonError();

await testAuthErrorsNotRetried();

await testClientErrorNotRetried();

await testRateLimitRetried();

await testRetryExhaustion();

await testRetryBodyIdentical();

await testServerJsonSuccess();

await testServerJsonError();

await testServerNonJsonError();

await testServerTimeoutAndNetworkErrors();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}