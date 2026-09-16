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
import Events from "../js/events.js";


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


/* -----------------------------------------------------------
   TEST 8 — F2: transient polling failures are retried and do
   NOT abort immediately; success still resolves.
----------------------------------------------------------- */

async function testTransientPollRetry() {

    let calls = 0;

    const generator = createGenerator(async () => {

        calls++;

        if (calls <= 2) {

            throw new Error("network blip");

        }

        return mockResponse({
            body: { status: "succeeded", output: ["https://img/retried.png"] }
        });

    }, { pollRetries: 3 });

    const url = await generator.waitForImage("pred-8");

    assert(
        "T8 transient failures retried then resolved",
        url === "https://img/retried.png"
    );

    assert(
        "T8 retry actually occurred (3+ polls)",
        calls >= 3
    );

    assert(
        "T8 no timer leaked after retry success",
        generator._pollTimer === null
    );

}


/* -----------------------------------------------------------
   TEST 9 — F2: retry is bounded; exhausting retries surfaces
   the polling error instead of polling forever.
----------------------------------------------------------- */

async function testBoundedTransientRetry() {

    let calls = 0;

    const generator = createGenerator(async () => {

        calls++;

        throw new Error("always down");

    }, { pollRetries: 2 });

    const error = await expectThrows(generator.waitForImage("pred-9"));

    assert(
        "T9 persistent failure rejects after bounded retries",
        error && error.message === "always down"
    );

    assert(
        "T9 bounded: exactly maxRetries+1 polls",
        calls === 3
    );

    assert(
        "T9 no timer leaked after bounded rejection",
        generator._pollTimer === null
    );

}


/* -----------------------------------------------------------
   TEST 10 — F2: successful generate() drives loading state and
   fires the full start->created->end event contract.
----------------------------------------------------------- */

async function testSuccessLoadingAndEvents() {

    const events = { start: false, created: null, end: false };

    const onStart = () => { events.start = true; };
    const onCreate = img => { events.created = img; };
    const onEnd = () => { events.end = true; };

    Events.on("image:start", onStart);
    Events.on("image:created", onCreate);
    Events.on("image:end", onEnd);

    const loadingDuringPost = [];

    const generator = createGenerator(async (url, opts) => {

        if (opts && opts.method === "POST") {

            loadingDuringPost.push(generator.state.loading);

            return mockResponse({ body: { success: true, id: "pred-10" } });

        }

        return mockResponse({
            body: { status: "succeeded", output: ["https://img/success.png"] }
        });

    });

    const image = await generator.generate("a cactus");

    assert(
        "T10 loading true while the POST request is in-flight",
        loadingDuringPost[0] === true
    );

    assert(
        "T10 image:start fired",
        events.start === true
    );

    assert(
        "T10 resolve returned the image URL",
        image && image.url === "https://img/success.png"
    );

    assert(
        "T10 image:created fired with the generated image",
        events.created && events.created.id === image.id
    );

    assert(
        "T10 image:end fired",
        events.end === true
    );

    assert(
        "T10 loading cleared after success",
        generator.state.loading === false
    );

    Events.off("image:start", onStart);
    Events.off("image:created", onCreate);
    Events.off("image:end", onEnd);

}


/* -----------------------------------------------------------
   TEST 11 — F2: generate() failure clears the loading state and
   still fires image:end (finally) plus the error event.
----------------------------------------------------------- */

async function testFailureClearsLoading() {

    const events = { errors: [], ends: 0 };

    const onError = err => { events.errors.push(err); };
    const onEnd = () => { events.ends++; };

    Events.on("image:error", onError);
    Events.on("image:end", onEnd);

    const generator = createGenerator(async () => mockResponse({
        status: 500,
        body: { success: false, error: "provider boom" }
    }));

    const error = await expectThrows(generator.generate("a dog"));

    assert(
        "T11 failure surfaces a clean error",
        error && error.message === "provider boom"
    );

    assert(
        "T11 loading cleared after failure",
        generator.state.loading === false
    );

    assert(
        "T11 image:error fired",
        events.errors.length === 1 &&
        events.errors[0].message === "provider boom"
    );

    assert(
        "T11 image:end still fired in finally",
        events.ends === 1
    );

    Events.off("image:error", onError);
    Events.off("image:end", onEnd);

}


await testTransientPollRetry();

await testBoundedTransientRetry();

await testSuccessLoadingAndEvents();

await testFailureClearsLoading();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}