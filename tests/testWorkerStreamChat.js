/* ===========================================================
   Test: native Cloudflare Workers SSE streaming (worker/streamChat.js).

   Zero-dependency harness (Node 22 native fetch/streams/Request).
   Verifies:
     - normalized delta/done SSE contract is byte-for-byte what
       js/api.js parses (event:/data: lines, {"delta":...})
     - [DONE] produces one done event and closes cleanly
     - malformed provider SSE is sanitized (never forwarded raw)
     - upstream non-2xx errors are sanitized (never leak provider
       bodies / keys / secrets)
     - authentication rejection (401 / 503 JSON, no SSE)
     - Bearer and signed-cookie auth succeed
     - missing message yields 400 JSON
     - empty successful stream emits exactly one done
     - client cancel aborts the upstream request
     - idle timeout aborts the upstream and emits a sanitized error
     - no real OpenRouter calls are made (mock fetchImpl only)
   =========================================================== */


import {
    createStreamChatResponse,
    createChatSseStream,
    authenticateStreamRequest,
    API_SECURITY_HEADERS
} from "../worker/streamChat.js";

import { formatSSE } from "../server/streamChat.js";

import { createSessionToken, SESSION_COOKIE } from "../worker/session.js";


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


function deltaPayload(text) {
    return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}


function makeRequest(body = { message: "hello", history: [], stream: true }, headers = {}) {
    return new Request("https://localhost/api/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...headers
        },
        body: JSON.stringify(body)
    });
}


function baseConfig(overrides = {}) {
    return {
        authDisabled: true,
        apiToken: "",
        sessionSecret: "",
        openrouterKey: "test-key",
        systemPrompt: "system prompt",
        upstreamUrl: "https://upstream.test/chat/completions",
        ...overrides
    };
}


function capturedFetch(options) {
    return async (url, init) => {
        return upstreamResponse(options);
    };
}


function countLines(text, eventName) {
    return text.split(`event: ${eventName}\n`).length - 1;
}


/* -----------------------------------------------------------
   1. Delta + done contract matches formatSSE exactly.
----------------------------------------------------------- */

async function testDeltaDoneContract() {

    const response = await createStreamChatResponse(
        makeRequest(),
        baseConfig({
            fetchImpl: capturedFetch({
                chunks: [deltaPayload("Hello"), "data: [DONE]\n\n"]
            })
        })
    );

    const text = await response.text();

    assert(
        "T1 status is 200",
        response.status === 200
    );

    assert(
        "T1 content-type is text/event-stream; charset=utf-8",
        response.headers.get("content-type") === "text/event-stream; charset=utf-8"
    );

    assert(
        "T1 cache-control disables buffering",
        response.headers.get("cache-control") === "no-cache, no-transform"
    );

    assert(
        "T1 x-accel-buffering off",
        response.headers.get("x-accel-buffering") === "no"
    );

    assert(
        "T1 security headers present",
        !!response.headers.get("content-security-policy") &&
        response.headers.get("x-content-type-options") === "nosniff" &&
        response.headers.get("x-frame-options") === "DENY"
    );

    assert(
        "T1 delta event is byte-for-byte formatSSE",
        text.includes(formatSSE("delta", { delta: "Hello" }))
    );

    assert(
        "T1 exactly one done event",
        countLines(text, "done") === 1 &&
        text.includes(formatSSE("done", {}))
    );

    assert(
        "T1 events readable by js/api.js shape (event:/data:)",
        text.includes("event: delta\n") &&
        text.includes("data: {\"delta\":\"Hello\"}\n\n")
    );

}


/* -----------------------------------------------------------
   2. Multiple deltas concatenate in order.
----------------------------------------------------------- */

async function testMultipleDeltas() {

    const response = await createStreamChatResponse(
        makeRequest(),
        baseConfig({
            fetchImpl: capturedFetch({
                chunks: [
                    deltaPayload("Hello"),
                    deltaPayload(" world"),
                    deltaPayload("!"),
                    "data: [DONE]\n\n"
                ]
            })
        })
    );

    const text = await response.text();

    const deltas = [...text.matchAll(/"delta":"([^"]*)"/g)]
        .map(m => m[1]);

    assert(
        "T2 deltas arrive in order",
        deltas.join("") === "Hello world!"
    );

    assert(
        "T2 exactly one done",
        countLines(text, "done") === 1
    );

}


/* -----------------------------------------------------------
   3. [DONE] alone closes cleanly.
----------------------------------------------------------- */

async function testDoneOnly() {

    const response = await createStreamChatResponse(
        makeRequest(),
        baseConfig({
            fetchImpl: capturedFetch({
                chunks: ["data: [DONE]\n\n"]
            })
        })
    );

    const text = await response.text();

    assert(
        "T3 only one done, no delta/error",
        countLines(text, "done") === 1 &&
        countLines(text, "delta") === 0 &&
        countLines(text, "error") === 0
    );

}


/* -----------------------------------------------------------
   4. Malformed provider SSE is sanitized.
----------------------------------------------------------- */

async function testMalformedChunk() {

    const response = await createStreamChatResponse(
        makeRequest(),
        baseConfig({
            fetchImpl: capturedFetch({
                chunks: [
                    deltaPayload("partial"),
                    "data: {not-valid-json\n\n"
                ]
            })
        })
    );

    const text = await response.text();

    assert(
        "T4 malformed chunk emits sanitized error",
        countLines(text, "error") === 1 &&
        text.includes("Something went wrong. Please try again.")
    );

    assert(
        "T4 raw malformed body never forwarded",
        !text.includes("not-valid-json")
    );

    assert(
        "T4 prior delta was kept, no done after error",
        text.includes('"delta":"partial"') &&
        countLines(text, "done") === 0
    );

}


/* -----------------------------------------------------------
   5. Upstream non-2xx errors are sanitized (no provider leaks).
----------------------------------------------------------- */

async function testUpstreamHttpErrors() {

    const cases = [
        [404, "The provider rejected the request."],
        [429, "The provider is rate-limited. Please try again shortly."],
        [503, "The provider is temporarily unavailable. Please try again."]
    ];

    for (const [status, expected] of cases) {

        const leak = "sk-provider-internal-secret-abc";

        const response = await createStreamChatResponse(
            makeRequest(),
            baseConfig({
                fetchImpl: capturedFetch({
                    ok: false,
                    status,
                    textBody: JSON.stringify({ error: { message: leak } })
                })
            })
        );

        const text = await response.text();

        assert(
            `T5 status ${status} maps to sanitized message`,
            countLines(text, "error") === 1 &&
            text.includes(`${expected}`)
        );

        assert(
            `T5 status ${status} never leaks provider body`,
            !text.includes(leak) &&
            !text.includes("sk-provider-internal-secret-abc")
        );

    }

}


/* -----------------------------------------------------------
   6. Authentication rejection fails closed with JSON, no SSE.
----------------------------------------------------------- */

async function testAuthRejection() {

    const unauth = await createStreamChatResponse(
        makeRequest(),
        baseConfig({
            authDisabled: false,
            apiToken: "secret-token",
            sessionSecret: "session-secret"
        })
    );

    const unauthBody = await unauth.text();

    assert(
        "T6 no credentials returns 401 JSON, not SSE",
        unauth.status === 401 &&
        unauth.headers.get("content-type")?.includes("application/json") &&
        !unauth.headers.get("content-type")?.includes("text/event-stream") &&
        unauthBody.includes('"error":"Unauthorized"') &&
        unauthBody.includes('"success":false')
    );

    assert(
        "T6 401 JSON still carries security headers",
        !!unauth.headers.get("content-security-policy")
    );

    const noToken = await createStreamChatResponse(
        makeRequest(),
        baseConfig({
            authDisabled: false,
            apiToken: "",
            sessionSecret: ""
        })
    );

    const noTokenBody = await noToken.text();

    assert(
        "T6 missing SERVER_API_TOKEN fails closed with 503",
        noToken.status === 503 &&
        noTokenBody.includes("SERVER_API_TOKEN is not configured")
    );

}


/* -----------------------------------------------------------
   7. Bearer token and signed cookie authenticate successfully.
----------------------------------------------------------- */

async function testAuthSuccess() {

    const bearer = await createStreamChatResponse(
        makeRequest(undefined, {
            cookie: "",
            authorization: "Bearer secret-token"
        }),
        baseConfig({
            authDisabled: false,
            apiToken: "secret-token",
            sessionSecret: "session-secret",
            fetchImpl: capturedFetch({
                chunks: [deltaPayload("ok"), "data: [DONE]\n\n"]
            })
        })
    );

    const bearerText = await bearer.text();

    assert(
        "T7 Bearer token allows the stream",
        bearer.status === 200 &&
        bearerText.includes('"delta":"ok"')
    );

    const token = createSessionToken("session-secret", {
        now: () => Date.now() + 10000
    });

    const cookie = await createStreamChatResponse(
        makeRequest(undefined, {
            cookie: `${SESSION_COOKIE}=${token}`
        }),
        baseConfig({
            authDisabled: false,
            apiToken: "secret-token",
            sessionSecret: "session-secret",
            fetchImpl: capturedFetch({
                chunks: [deltaPayload("ok"), "data: [DONE]\n\n"]
            })
        })
    );

    const cookieText = await cookie.text();

    assert(
        "T7 signed session cookie allows the stream",
        cookie.status === 200 &&
        cookieText.includes('"delta":"ok"')
    );

    const badSecret = await createStreamChatResponse(
        makeRequest({}, {
            cookie: `${SESSION_COOKIE}=${token}`
        }),
        baseConfig({
            authDisabled: false,
            apiToken: "secret-token",
            sessionSecret: "wrong-secret",
            fetchImpl: capturedFetch({
                chunks: [deltaPayload("ok"), "data: [DONE]\n\n"]
            })
        })
    );

    assert(
        "T7 cookie signed by the wrong secret is rejected",
        badSecret.status === 401
    );

}


/* -----------------------------------------------------------
   8. Missing message returns 400 JSON, never SSE.
----------------------------------------------------------- */

async function testMissingMessage() {

    const response = await createStreamChatResponse(
        makeRequest({ message: "   ", stream: true }),
        baseConfig()
    );

    const body = await response.text();

    assert(
        "T8 blank message returns 400 JSON",
        response.status === 400 &&
        body.includes('"error":"Message is required."') &&
        !response.headers.get("content-type")?.includes("text/event-stream")
    );

}


/* -----------------------------------------------------------
   9. Empty successful stream produces exactly one done.
----------------------------------------------------------- */

async function testEmptyStream() {

    const response = await createStreamChatResponse(
        makeRequest(),
        baseConfig({
            fetchImpl: capturedFetch({ chunks: [] })
        })
    );

    const text = await response.text();

    assert(
        "T9 empty stream emits one done and nothing else",
        countLines(text, "done") === 1 &&
        countLines(text, "delta") === 0 &&
        countLines(text, "error") === 0
    );

}


/* -----------------------------------------------------------
   10. Secret/key never appears in any output.
----------------------------------------------------------- */

async function testSecretNeverLeaked() {

    const key = "sk-very-secret-token-value-123456789";

    const response = await createStreamChatResponse(
        makeRequest(),
        baseConfig({
            openrouterKey: key,
            fetchImpl: capturedFetch({
                chunks: [
                    deltaPayload("leak check"),
                    `data: ${JSON.stringify({ error: { message: key } })}\n\n` +
                    `data: {not-json ${key}\n\n`
                ]
            })
        })
    );

    const text = await response.text();

    assert(
        "T10 API key never appears in output",
        !text.includes(key) &&
        !text.includes("sk-very-secret-token-value")
    );

    assert(
        "T10 auth header never forwarded",
        !text.includes("Authorization") &&
        !text.includes("Bearer ")
    );

    assert(
        "T10 system prompt never forwarded",
        !text.includes("system prompt")
    );

}


/* -----------------------------------------------------------
   11. Client cancel (upstream abort via response stream cancel).
----------------------------------------------------------- */

async function testClientCancelAbortsUpstream() {

    let capturedSignal = null;

    const response = await createStreamChatResponse(
        makeRequest(),
        baseConfig({
            fetchImpl: async (url, init) => {
                capturedSignal = init.signal;
                return upstreamResponse({
                    chunks: [],
                    signal: init.signal
                });
            }
        })
    );

    assert(
        "T11 stream is open before cancel",
        response.status === 200
    );

    if (response.body) {
        await response.body.cancel();
    }

    await new Promise(resolve => setTimeout(resolve, 50));

    assert(
        "T11 cancelling the response abort signal fires upstream abort",
        capturedSignal !== null &&
        capturedSignal.aborted === true
    );

}


/* -----------------------------------------------------------
   12. Idle timeout aborts upstream and emits a sanitized error.
----------------------------------------------------------- */

async function testTimeoutAbortsUpstream() {

    let capturedSignal = null;

    const response = await createStreamChatResponse(
        makeRequest(),
        baseConfig({
            timeoutMs: 40,
            fetchImpl: async (url, init) => {
                capturedSignal = init.signal;
                return upstreamResponse({
                    chunks: [],
                    signal: init.signal
                });
            }
        })
    );

    const text = await response.text();

    assert(
        "T12 upstream request was aborted by idle timeout",
        capturedSignal !== null &&
        capturedSignal.aborted === true
    );

    assert(
        "T12 timeout emits sanitized error, no delta/done",
        text.includes("event: error\n") &&
        text.includes("Upstream timed out.") &&
        countLines(text, "delta") === 0 &&
        countLines(text, "done") === 0
    );

}


/* -----------------------------------------------------------
   13. Stream body function itself closes after [DONE].
----------------------------------------------------------- */

async function testStreamBodyCloses() {

    const stream = createChatSseStream({
        openrouterKey: "test-key",
        systemPrompt: "system prompt",
        message: "hello",
        fetchImpl: async () => upstreamResponse({
            chunks: [deltaPayload("A"), deltaPayload("B"), "data: [DONE]\n\n"]
        })
    });

    const reader = stream.getReader();

    let all = "";

    for (;;) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        all += new TextDecoder().decode(value);
    }

    assert(
        "T13 stream closes after [DONE]",
        countLines(all, "done") === 1 &&
        all.includes('"delta":"A"') &&
        all.includes('"delta":"B"')
    );

}


/* -----------------------------------------------------------
   14. authenticateStreamRequest unit behavior.
----------------------------------------------------------- */

async function testAuthenticateUnit() {

    const ok = await authenticateStreamRequest(
        new Request("https://x/api/chat", {
            method: "POST",
            headers: { Authorization: "Bearer abc" }
        }),
        { authDisabled: true, apiToken: "", sessionSecret: "" }
    );

    assert(
        "T14 dev no-auth mode authenticates",
        ok.ok === true
    );

    const denied = await authenticateStreamRequest(
        new Request("https://x/api/chat", {
            method: "POST"
        }),
        { authDisabled: false, apiToken: "abc", sessionSecret: "s" }
    );

    assert(
        "T14 missing credentials denied with 401",
        denied.ok === false &&
        denied.status === 401
    );

}


/* -----------------------------------------------------------
   RUN ALL TESTS
----------------------------------------------------------- */

await testDeltaDoneContract();

await testMultipleDeltas();

await testDoneOnly();

await testMalformedChunk();

await testUpstreamHttpErrors();

await testAuthRejection();

await testAuthSuccess();

await testMissingMessage();

await testEmptyStream();

await testSecretNeverLeaked();

await testClientCancelAbortsUpstream();

await testTimeoutAbortsUpstream();

await testStreamBodyCloses();

await testAuthenticateUnit();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}