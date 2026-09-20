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


/* 7. clientIp resolves plain-object headers (Express req.headers path).

   Before the fix, clientIp() only checked headers.get (Web API Headers),
   so Express middleware always returned "unknown" and all users shared
   one rate-limit bucket. This verifies the fix handles plain objects. */

{
    const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 3 });

    /* Express-style plain object with cf-connecting-ip */
    const expressReqA = {
        path: "/api/login",
        headers: { "cf-connecting-ip": "192.168.1.100" }
    };

    const expressReqB = {
        path: "/api/login",
        headers: { "cf-connecting-ip": "192.168.1.200" }
    };

    assert.strictEqual(limiter.middleware(expressReqA, {
        setHeader() {},
        status() { return this; },
        json() {}
    }, () => {}), undefined, "first plain-object request allowed");

    assert.strictEqual(limiter.middleware(expressReqA, {
        setHeader() {},
        status() { return this; },
        json() {}
    }, () => {}), undefined, "second plain-object request allowed");

    assert.strictEqual(limiter.middleware(expressReqA, {
        setHeader() {},
        status() { return this; },
        json() {}
    }, () => {}), undefined, "third plain-object request allowed");

    let limited = false;
    limiter.middleware(expressReqA, {
        setHeader() {},
        status(c) { limited = c === 429; return this; },
        json() {}
    }, () => {});
    assert.strictEqual(limited, true, "4th request from same IP is blocked (plain-object path)");

    /* Different IP via plain-object gets its own bucket. */
    let nextCalled = false;
    limiter.middleware(expressReqB, {
        setHeader() {},
        status() { return this; },
        json() {}
    }, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, "different plain-object IP gets its own bucket");
}


/* 7b. clientIp falls back to x-forwarded-for when cf-connecting-ip absent. */

{
    const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 2 });

    const req1 = {
        path: "/api/login",
        headers: { "x-forwarded-for": "10.0.0.50, 10.0.0.51" }
    };

    let nexted = false;
    limiter.middleware(req1, {
        setHeader() {},
        status() { return this; },
        json() {}
    }, () => { nexted = true; });
    assert.strictEqual(nexted, true, "x-forwarded-for first entry used (plain object)");

    nexted = false;
    limiter.middleware(req1, {
        setHeader() {},
        status() { return this; },
        json() {}
    }, () => { nexted = true; });
    assert.strictEqual(nexted, true, "second request still within limit");

    let limited = false;
    limiter.middleware(req1, {
        setHeader() {},
        status(c) { limited = c === 429; return this; },
        json() {}
    }, () => {});
    assert.strictEqual(limited, true, "third request exceeds limit (x-forwarded-for path)");
}


/* 7c. Spoofed x-forwarded-for is ignored when cf-connecting-ip is present. */

{
    const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 2 });

    /* The real IP is 1.2.3.4; the spoofed forwarded-for is 9.9.9.9. */
    const realReq = {
        path: "/api/login",
        headers: {
            "cf-connecting-ip": "1.2.3.4",
            "x-forwarded-for": "9.9.9.9"
        }
    };

    limiter.middleware(realReq, {
        setHeader() {},
        status() { return this; },
        json() {}
    }, () => {});

    limiter.middleware(realReq, {
        setHeader() {},
        status() { return this; },
        json() {}
    }, () => {});

    /* Third request from same real IP is blocked. */
    let limited = false;
    limiter.middleware(realReq, {
        setHeader() {},
        status(c) { limited = c === 429; return this; },
        json() {}
    }, () => {});
    assert.strictEqual(limited, true, "spoofed x-forwarded-for does not bypass limiter");

    /* Request with only the spoofed IP in x-forwarded-for (no cf-connecting-ip)
       would be keyed as the spoofed IP — this is correct because without
       cf-connecting-ip we have no better signal. */
    const spoofOnly = {
        path: "/api/login",
        headers: { "x-forwarded-for": "9.9.9.9" }
    };
    let nexted = false;
    limiter.middleware(spoofOnly, {
        setHeader() {},
        status() { return this; },
        json() {}
    }, () => { nexted = true; });
    assert.strictEqual(nexted, true, "spoof-only IP gets its own fresh bucket");
}


/* 7d. Login limiter: normal login allowed, repeated attempts hit limit,
       and window reset restores access. */

{
    const loginLimiter = createRateLimiter({ windowMs: 80, max: 3 });

    function tryLogin(ip) {
        let result = "next";
        loginLimiter.middleware(
            { path: "/api/login", headers: { "cf-connecting-ip": ip } },
            {
                setHeader() {},
                status(code) {
                    if (code === 429) { result = "429"; }
                    return this;
                },
                json() {}
            },
            () => { result = "next"; }
        );
        return result;
    }

    assert.strictEqual(tryLogin("1.1.1.1"), "next", "login attempt 1 allowed");
    assert.strictEqual(tryLogin("1.1.1.1"), "next", "login attempt 2 allowed");
    assert.strictEqual(tryLogin("1.1.1.1"), "next", "login attempt 3 allowed");
    assert.strictEqual(tryLogin("1.1.1.1"), "429", "login attempt 4 blocked");

    /* Different user is unaffected. */
    assert.strictEqual(tryLogin("2.2.2.2"), "next", "different user not blocked");

    /* After window expires, original user can login again. */
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(tryLogin("1.1.1.1"), "next", "login allowed after window reset");
}


/* 7e. No HTTP method in rate-limit key: same IP + same path = same bucket. */

{
    const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 1 });

    const getReq = {
        path: "/api/session",
        headers: { "cf-connecting-ip": "5.5.5.5" }
    };

    let nexted = false;
    limiter.middleware(getReq, {
        setHeader() {},
        status() { return this; },
        json() {}
    }, () => { nexted = true; });
    assert.strictEqual(nexted, true, "first request to path allowed");

    /* Second request to same path + same IP is blocked. */
    let limited = false;
    limiter.middleware(getReq, {
        setHeader() {},
        status(c) { limited = c === 429; return this; },
        json() {}
    }, () => {});
    assert.strictEqual(limited, true, "same-path same-IP second request blocked");
}


/* 7f. clientIp returns "unknown" when no IP headers present (both paths). */

{
    const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 1 });

    /* Plain object, no IP headers. */
    const plainA = { path: "/api/login", headers: {} };
    const plainB = { path: "/api/login", headers: {} };

    limiter.middleware(plainA, {
        setHeader() {},
        status() { return this; },
        json() {}
    }, () => {});

    /* Second plain object shares the "unknown" bucket. */
    let limited = false;
    limiter.middleware(plainB, {
        setHeader() {},
        status(c) { limited = c === 429; return this; },
        json() {}
    }, () => {});
    assert.strictEqual(limited, true, "unknown-bucket collision for plain objects");

    /* Native Request without IP headers also uses "unknown" via allowRequest. */
    const limiter2 = createRateLimiter({ windowMs: 60 * 1000, max: 1 });
    const nativeA = new Request("https://x.test/api/login", { method: "POST" });
    const nativeB = new Request("https://x.test/api/login", { method: "POST" });

    assert.strictEqual(limiter2.allowRequest(nativeA, "/api/login"), true);
    assert.strictEqual(
        limiter2.allowRequest(nativeB, "/api/login"),
        false,
        "unknown-bucket collision for native requests via allowRequest"
    );
}


console.log("PASS: Worker security primitives (rate limit + body cap + revocation wiring)");