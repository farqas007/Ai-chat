/* ===========================================================
   Regression tests for the ImageGenerator.

   S1 (client token):
       getAuthHeaders() never sends an Authorization header and
       never reads window.AI_CHAT_TOKEN or localStorage — the
       client is fully cookie-based.
   Error handling:
       generate()/checkStatus() check the HTTP status before
       trusting JSON; a non-JSON error body throws a clean
       Error, never a SyntaxError.
   F12 (reliability):
       waitForImage() resolves on "succeeded", rejects on
       "failed", rejects on a bounded timeout, and destroy()
       cancels an in-flight poll. Every path clears the timer.
=========================================================== */

import { ImageGenerator } from "../js/imageGenerator.js";


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


function mockResponse({ status = 200, contentType = "application/json", body }) {

    const text = typeof body === "string" ? body : JSON.stringify(body);

    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => contentType },
        async json() { return JSON.parse(text); },
        async text() { return text; }
    };

}


function createGenerator(fetchImpl, config = {}) {

    globalThis.fetch = fetchImpl;

    const generator = new ImageGenerator();

    generator.configure({
        endpoint: "https://example.test/generate-image",
        pollInterval: 5,
        pollTimeout: 50,
        ...config
    });

    return generator;

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
   TEST 1 — S1: no Authorization header ever sent.
----------------------------------------------------------- */

async function testNoClientToken() {

    const headersSent = [];

    const generator = createGenerator(async (url, opts) => {

        headersSent.push(opts.headers);

        return mockResponse({
            status: 400,
            body: { success: false, error: "rejected" }
        });

    });

    await generator.generate("a cat").catch(() => {});

    assert("T1 no Authorization header in getAuthHeaders", !("Authorization" in generator.getAuthHeaders()));

    assert(
        "T1 request headers carry no token",
        headersSent.length === 1 &&
        headersSent[0] &&
        !("Authorization" in headersSent[0])
    );

    assert(
        "T1 Content-Type preserved",
        headersSent[0] && headersSent[0]["Content-Type"] === "application/json"
    );

}


/* -----------------------------------------------------------
   TEST 2 — Non-JSON server error body is handled cleanly
   (no SyntaxError) and derives safe fallback message.
----------------------------------------------------------- */

async function testNonJsonError() {

    const generator = createGenerator(async () => mockResponse({
        status: 500,
        contentType: "text/html",
        body: "<html>ooops</html>"
    }));

    const error = await expectThrows(generator.generate("a dog"));

    assert(
        "T2 clean Error, not SyntaxError",
        error && error.message !== undefined &&
        !(error instanceof SyntaxError) &&
        !/Unexpected token/.test(error.message)
    );

    assert(
        "T2 fallback message used",
        error && error.message === "Image API Failed"
    );

}


/* -----------------------------------------------------------
   TEST 3 — HTTP error now rejected BEFORE trusting JSON.
----------------------------------------------------------- */

async function testHttpErrorBeforeJson() {

    const generator = createGenerator(async () => mockResponse({
        status: 401,
        body: { success: false, error: "nope" }
    }));

    const error = await expectThrows(generator.generate("a duck"));

    assert(
        "T3 401 rejected with server error message",
        error && error.message === "nope"
    );

}


/* -----------------------------------------------------------
   TEST 4 — F12: waitForImage resolves on "succeeded".
----------------------------------------------------------- */

async function testSucceededPoll() {

    let calls = 0;

    const generator = createGenerator(async (url) => {

        calls++;

        return mockResponse({
            body: calls === 1
                ? { status: "processing" }
                : { status: "succeeded", output: ["https://img/pic.png"] }
        });

    });

    const url = await generator.waitForImage("pred-1");

    assert("T4 resolved with output[0]", url === "https://img/pic.png");

    assert(
        "T4 no timer leaked after success",
        generator._pollTimer === null
    );

}


/* -----------------------------------------------------------
   TEST 5 — F12: waitForImage rejects on "failed".
----------------------------------------------------------- */

async function testFailedPoll() {

    const generator = createGenerator(async () => mockResponse({
        body: { status: "failed" }
    }));

    const error = await expectThrows(generator.waitForImage("pred-2"));

    assert(
        "T5 rejected on failed status",
        error && /failed/.test(error.message)
    );

    assert(
        "T5 no timer leaked after failure",
        generator._pollTimer === null
    );

}


/* -----------------------------------------------------------
   TEST 6 — F12: waitForImage rejects on bounded timeout.
----------------------------------------------------------- */

async function testTimeout() {

    const generator = createGenerator(async () => mockResponse({
        body: { status: "processing" }
    }));

    const error = await expectThrows(generator.waitForImage("pred-3"));

    assert(
        "T6 rejected on timeout",
        error && /timed out/.test(error.message)
    );

    assert(
        "T6 no timer leaked after timeout",
        generator._pollTimer === null
    );

}


/* -----------------------------------------------------------
   TEST 7 — F12: destroy() cancels an in-flight poll.
----------------------------------------------------------- */

async function testDestroyCancelsPoll() {

    const generator = createGenerator(async () => mockResponse({
        body: { status: "processing" }
    }));

    const pending = generator.waitForImage("pred-4");

    generator.destroy();

    const error = await expectThrows(pending);

    assert(
        "T7 destroy rejects pending poll",
        error && /cancelled/.test(error.message)
    );

    assert(
        "T7 no timer leaked after destroy",
        generator._pollTimer === null &&
        generator._pollReject === null &&
        generator._pollResolve === null
    );

}


await testNoClientToken();

await testNonJsonError();

await testHttpErrorBeforeJson();

await testSucceededPoll();

await testFailedPoll();

await testTimeout();

await testDestroyCancelsPoll();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}