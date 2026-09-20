/* ===========================================================
   Test: Worker-native security primitives (SEC-01 / SEC-07).

   Tests the pure helpers without importing worker/index.js (which
   calls app.listen() at import time):
     - readJsonBody: size-capped JSON body parsing
     - createRateLimiter: sliding-window allow/deny + reset
     - createStreamChatResponse: 413 before auth, 429 rate-limit
       hook (upstream never called)
     - worker/index.js wiring is asserted at source level
   =========================================================== */

import assert from "node:assert";

import fs from "node:fs";

import path from "node:path";

import { fileURLToPath } from "node:url";

import {
    createStreamChatResponse,
    readJsonBody,
    MAX_BODY_BYTES
} from "../worker/streamChat.js";

import { createRateLimiter } from "../worker/rateLimit.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.join(__dirname, "..");


/* 1. readJsonBody parses valid JSON and flags oversized payloads. */

{
    const ok = await readJsonBody(new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({ stream: true, message: "hi" })
    }), 1024);

    assert.strictEqual(ok.ok, true, "valid JSON parses");

    assert.strictEqual(ok.body.stream, true);

    assert.strictEqual(ok.tooLarge, false);

    /* Oversize via declared content-length. */

    const tooLong = await readJsonBody(new Request("https://x.test", {
        method: "POST",
        body: "x".repeat(200)
    }), 100);

    assert.strictEqual(tooLong.tooLarge, true, "oversized body flagged");

    assert.strictEqual(tooLong.ok, false);

    /* Malformed JSON -> readable signal, never a throw. */

    const bad = await readJsonBody(new Request("https://x.test", {
        method: "POST",
        body: "{oops"
    }), 1024);

    assert.strictEqual(bad.ok, false);

    assert.strictEqual(bad.tooLarge, false);

    assert.strictEqual(bad.body, null);

    /* Default cap mirrors express.json 1mb on both servers. */

    assert.strictEqual(MAX_BODY_BYTES, 1024 * 1024, "default cap is 1MB");
}


/* 2. createRateLimiter sliding window. */

{
    const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 3 });

    const req = new Request("https://x.test/api/chat", { method: "POST" });

    assert.strictEqual(limiter.allowRequest(req, "/api/chat"), true);

    assert.strictEqual(limiter.allowRequest(req, "/api/chat"), true);

    assert.strictEqual(limiter.allowRequest(req, "/api/chat"), true);

    assert.strictEqual(
        limiter.allowRequest(req, "/api/chat"),
        false,
        "4th burst within the window is blocked"
    );

    /* A different client IP is untouched. */

    const other = new Request("https://x.test/api/chat", {
        method: "POST",
        headers: { "cf-connecting-ip": "10.0.0.9" }
    });

    assert.strictEqual(
        limiter.allowRequest(other, "/api/chat"),
        true,
        "different client unaffected"
    );
}


/* 3. Window reset lets traffic through again. */

{
    const limiter = createRateLimiter({ windowMs: 60, max: 2 });

    const req = new Request("https://x.test/api/chat", { method: "POST" });

    limiter.allowRequest(req, "/api/chat");

    limiter.allowRequest(req, "/api/chat");

    assert.strictEqual(limiter.allowRequest(req, "/api/chat"), false);

    await new Promise(resolve => setTimeout(resolve, 80));

    assert.strictEqual(
        limiter.allowRequest(req, "/api/chat"),
        true,
        "after the window resets, traffic is allowed again"
    );
}


/* 3b. Selective eviction: stale entries are removed but active buckets survive. */

{
    const limiter = createRateLimiter({ windowMs: 50, max: 2 });

    const active = new Request("https://x.test/api/chat", {
        method: "POST",
        headers: { "cf-connecting-ip": "10.0.0.100" }
    });

    const stale = new Request("https://x.test/api/chat", {
        method: "POST",
        headers: { "cf-connecting-ip": "10.0.0.200" }
    });

    limiter.allowRequest(stale, "/api/chat");
    limiter.allowRequest(stale, "/api/chat");

    await new Promise(resolve => setTimeout(resolve, 80));

    limiter.allowRequest(active, "/api/chat");

    assert.strictEqual(
        limiter.allowRequest(active, "/api/chat"),
        true,
        "active client bucket survives after stale entries expire"
    );
}


/* 4. createStreamChatResponse: oversized body -> 413, before any auth. */

{
    const response = await createStreamChatResponse(
        new Request("https://x.test/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": String(MAX_BODY_BYTES + 1)
            },
            body: "{}"
        }),
        {
            authDisabled: false,
            apiToken: "",
            sessionSecret: "",
            openrouterKey: "rk-test-key"
        }
    );

    assert.strictEqual(response.status, 413, "oversized body returns 413");

    const parsed = await response.json();

    assert.strictEqual(parsed.success, false);
}


/* 5. createStreamChatResponse: rate limit -> 429, upstream untouched. */

{
    const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 0 });

    let upstreamCalled = false;

    const response = await createStreamChatResponse(
        new Request("https://x.test/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stream: true, message: "hi" })
        }),
        {
            authDisabled: true,
            apiToken: "",
            sessionSecret: "",
            openrouterKey: "rk-test-key",
            rateLimiter: limiter,
            fetchImpl: () => {
                upstreamCalled = true;
                return new Response("{}");
            }
        }
    );

    assert.strictEqual(response.status, 429, "rate-limited stream returns 429");

    assert.ok(
        response.headers.get("retry-after"),
        "429 carries a Retry-After header"
    );

    assert.strictEqual(
        upstreamCalled,
        false,
        "blocked request never reaches the upstream provider"
    );
}


/* 6. worker/index.js wiring is present at source level. */

{
    const source = fs.readFileSync(
        path.join(repoRoot, "worker/index.js"),
        "utf8"
    );

    assert.ok(source.includes("createRateLimiter"), "index imports the rate limiter");

    assert.ok(source.includes("chatLimiter"), "index defines a chat limiter");

    assert.ok(source.includes("readJsonBody"), "index uses the capped body reader");

    assert.ok(source.includes("revokeSessionToken"), "index wires logout revocation");

    assert.ok(
        source.includes('app.post("/api/chat", requireAuth, chatLimiter.middleware'),
        "chat route applies auth then rate limit"
    );

    assert.ok(
        source.includes("loginLimiter.middleware"),
        "login route applies its limiter"
    );

    assert.ok(
        source.includes('app.post("/generate-image", requireAuth, imageCreateLimiter.middleware'),
        "image create applies its limiter"
    );

    assert.ok(
        source.includes("imageStatusLimiter.middleware"),
        "image status applies its limiter"
    );

    assert.ok(
        source.includes("rateLimiter: chatLimiter"),
        "native stream path receives the chat limiter"
    );

    assert.ok(
        source.includes("SESSION_COOKIE"),
        "logout reads the session cookie for revocation"
    );
}


console.log("PASS: Worker security primitives (rate limit + body cap + revocation wiring)");