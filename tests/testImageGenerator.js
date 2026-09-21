/* ===========================================================
   Regression tests for the ImageGenerator.

   Tests the synchronous Workers AI flow where POST /generate-image
   returns { success, image } in a single request.

   S1 (client token):
       getAuthHeaders() never sends an Authorization header and
       never reads window.AI_CHAT_TOKEN or localStorage — the
       client is fully cookie-based.
   Error handling:
       generate() checks the HTTP status before trusting JSON;
       a non-JSON error body throws a clean Error, never a
       SyntaxError.
   F12 (reliability):
       generate() fires the full start->created->end event
       contract. Loading state is cleared on both success and
       failure. No polling or timers are used.
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
   TEST 4 — Successful synchronous generate returns image data.
----------------------------------------------------------- */

async function testSynchronousSuccess() {

    const fakeDataURI = "data:image/jpeg;charset=utf-8;base64,AAAA";

    const generator = createGenerator(async () => mockResponse({
        body: { success: true, image: fakeDataURI }
    }));

    const image = await generator.generate("a sunset");

    assert(
        "T4 resolved with image data URI",
        image && image.url === fakeDataURI
    );

    assert(
        "T4 image has an id",
        image && typeof image.id === "string" && image.id.startsWith("img_")
    );

    assert(
        "T4 image has prompt",
        image && image.prompt === "a sunset"
    );

    assert(
        "T4 image has createdAt",
        image && typeof image.createdAt === "string"
    );

}


/* -----------------------------------------------------------
   TEST 5 — Missing image data in response is rejected.
----------------------------------------------------------- */

async function testMissingImageData() {

    const generator = createGenerator(async () => mockResponse({
        body: { success: true }
    }));

    const error = await expectThrows(generator.generate("a cat"));

    assert(
        "T5 rejected when image field missing",
        error && /no image data/.test(error.message)
    );

}


/* -----------------------------------------------------------
   TEST 6 — Empty string image data is rejected.
----------------------------------------------------------- */

async function testEmptyImageData() {

    const generator = createGenerator(async () => mockResponse({
        body: { success: true, image: "" }
    }));

    const error = await expectThrows(generator.generate("a cat"));

    assert(
        "T6 rejected when image is empty string",
        error && /no image data/.test(error.message)
    );

}


/* -----------------------------------------------------------
   TEST 7 — Non-string image data is rejected.
----------------------------------------------------------- */

async function testNonStringImageData() {

    const generator = createGenerator(async () => mockResponse({
        body: { success: true, image: 12345 }
    }));

    const error = await expectThrows(generator.generate("a cat"));

    assert(
        "T7 rejected when image is not a string",
        error && /no image data/.test(error.message)
    );

}


/* -----------------------------------------------------------
   TEST 8 — F2: successful generate() drives loading state and
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

    const fakeDataURI = "data:image/jpeg;charset=utf-8;base64,BBBB";

    const loadingDuringPost = [];

    const generator = createGenerator(async (url, opts) => {

        if (opts && opts.method === "POST") {

            loadingDuringPost.push(generator.state.loading);

            return mockResponse({ body: { success: true, image: fakeDataURI } });

        }

        return mockResponse({ status: 404, body: { error: "not found" } });

    });

    const image = await generator.generate("a cactus");

    assert(
        "T8 loading true while the POST request is in-flight",
        loadingDuringPost[0] === true
    );

    assert(
        "T8 image:start fired",
        events.start === true
    );

    assert(
        "T8 resolve returned the image data URI",
        image && image.url === fakeDataURI
    );

    assert(
        "T8 image:created fired with the generated image",
        events.created && events.created.id === image.id
    );

    assert(
        "T8 image:end fired",
        events.end === true
    );

    assert(
        "T8 loading cleared after success",
        generator.state.loading === false
    );

    Events.off("image:start", onStart);
    Events.off("image:created", onCreate);
    Events.off("image:end", onEnd);

}


/* -----------------------------------------------------------
   TEST 9 — F2: generate() failure clears the loading state and
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
        "T9 failure surfaces a clean error",
        error && error.message === "provider boom"
    );

    assert(
        "T9 loading cleared after failure",
        generator.state.loading === false
    );

    assert(
        "T9 image:error fired",
        events.errors.length === 1 &&
        events.errors[0].message === "provider boom"
    );

    assert(
        "T9 image:end still fired in finally",
        events.ends === 1
    );

    Events.off("image:error", onError);
    Events.off("image:end", onEnd);

}


/* -----------------------------------------------------------
   TEST 10 — Provider returns success:false with error message.
----------------------------------------------------------- */

async function testProviderSuccessFalse() {

    const generator = createGenerator(async () => mockResponse({
        body: { success: false, error: "quota exceeded" }
    }));

    const error = await expectThrows(generator.generate("a cat"));

    assert(
        "T10 success:false surfaces error message",
        error && error.message === "quota exceeded"
    );

}


/* -----------------------------------------------------------
   TEST 11 — Empty/null prompt returns null without making a
   request.
----------------------------------------------------------- */

async function testEmptyPromptReturnsNull() {

    let fetchCalled = false;

    const generator = createGenerator(async () => {
        fetchCalled = true;
        return mockResponse({ body: { success: true, image: "data:image/jpeg;base64,xxx" } });
    });

    const resultNull = await generator.generate(null);
    const resultEmpty = await generator.generate("");
    const resultWhitespace = await generator.generate("   ");

    assert(
        "T11 null prompt returns null",
        resultNull === null
    );

    assert(
        "T11 empty prompt returns null",
        resultEmpty === null
    );

    assert(
        "T11 whitespace prompt returns null",
        resultWhitespace === null
    );

    assert(
        "T11 no fetch call made for empty prompts",
        fetchCalled === false
    );

}


/* -----------------------------------------------------------
   TEST 12 — Images are accumulated in state.
----------------------------------------------------------- */

async function testImagesAccumulated() {

    const generator = createGenerator(async () => mockResponse({
        body: { success: true, image: "data:image/jpeg;base64,XXX" }
    }));

    await generator.generate("a cat");
    await generator.generate("a dog");

    const images = generator.getImages();

    assert(
        "T12 two images accumulated",
        images.length === 2
    );

    assert(
        "T12 first image has correct prompt",
        images[0].prompt === "a cat"
    );

    assert(
        "T12 second image has correct prompt",
        images[1].prompt === "a dog"
    );

}


/* -----------------------------------------------------------
   TEST 13 — No polling or timer leaks after operations.
----------------------------------------------------------- */

async function testNoTimers() {

    const generator = createGenerator(async () => mockResponse({
        body: { success: true, image: "data:image/jpeg;base64,YYY" }
    }));

    await generator.generate("a bird");

    assert(
        "T13 no _pollTimer after generate",
        generator._pollTimer === undefined || generator._pollTimer === null
    );

    assert(
        "T13 no _pollResolve after generate",
        generator._pollResolve === undefined || generator._pollResolve === null
    );

    assert(
        "T13 no _pollReject after generate",
        generator._pollReject === undefined || generator._pollReject === null
    );

}


/* -----------------------------------------------------------
   TEST 14 — generate() failure does not leak timers.
----------------------------------------------------------- */

async function testNoTimersOnError() {

    const generator = createGenerator(async () => mockResponse({
        status: 500,
        body: { success: false, error: "fail" }
    }));

    await expectThrows(generator.generate("a cat"));

    assert(
        "T14 no _pollTimer after error",
        generator._pollTimer === undefined || generator._pollTimer === null
    );

    assert(
        "T14 no _pollResolve after error",
        generator._pollResolve === undefined || generator._pollResolve === null
    );

    assert(
        "T14 no _pollReject after error",
        generator._pollReject === undefined || generator._pollReject === null
    );

}


await testNoClientToken();

await testNonJsonError();

await testHttpErrorBeforeJson();

await testSynchronousSuccess();

await testMissingImageData();

await testEmptyImageData();

await testNonStringImageData();

await testSuccessLoadingAndEvents();

await testFailureClearsLoading();

await testProviderSuccessFalse();

await testEmptyPromptReturnsNull();

await testImagesAccumulated();

await testNoTimers();

await testNoTimersOnError();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}
