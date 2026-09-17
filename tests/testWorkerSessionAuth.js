/* ===========================================================
   Test: Cloudflare Workers session auth (stateless signed cookies).

   Covers the Workers-only helpers without any network or Workers
   runtime dependency:
   - signed token creation + verification
   - tamper / wrong-secret / malformed rejection
   - expiry (injected clock) preserves the existing TTL behavior
   - SESSION_SECRET is required; NO fallback to SERVER_API_TOKEN
   - middleware: dev bypass, fail-closed no-token, cookie, Bearer
   - cookie security attributes (HttpOnly/Secure/SameSite=Strict)
   - no secret material embedded in the worker sources
   =========================================================== */


import assert from "node:assert";

import fs from "node:fs";

import path from "node:path";

import { fileURLToPath } from "node:url";

import {
    SESSION_COOKIE,
    DEFAULT_TTL_MS
} from "../server/sessionAuth.js";

import {
    createSessionToken,
    verifySessionToken,
    revokeSessionToken,
    hasSessionSecret,
    SESSION_COOKIE_OPTIONS
} from "../worker/session.js";

import { createWorkerRequireAuth } from "../worker/auth.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.join(__dirname, "..");

const SECRET = "worker-session-secret-value";


/* 1. Create + verify a valid token. */

{
    const token = createSessionToken(SECRET);

    assert.strictEqual(typeof token, "string");

    assert.ok(token.includes("."), "token is payload.signature");

    assert.strictEqual(verifySessionToken(token, SECRET), true);

    /* The signed token must not contain the secret itself. */

    assert.ok(!token.includes(SECRET), "token never embeds the secret");
}


/* 2. Wrong secret / tampered payload / tampered signature rejected. */

{
    const token = createSessionToken(SECRET);

    assert.strictEqual(
        verifySessionToken(token, "different-secret"),
        false,
        "wrong secret rejected"
    );

    const [payload, signature] = token.split(".");

    const tamperedPayload = `${payload.slice(0, -2)}AA.${signature}`;

    assert.strictEqual(
        verifySessionToken(tamperedPayload, SECRET),
        false,
        "tampered payload rejected"
    );

    const tamperedSignature = `${payload}.${signature.slice(0, -2)}AA`;

    assert.strictEqual(
        verifySessionToken(tamperedSignature, SECRET),
        false,
        "tampered signature rejected"
    );
}


/* 3. Malformed input never throws and is rejected. */

{
    for (const bad of [null, undefined, "", "nodot", "a.b.c", ".", "a.", ".b"]) {
        assert.strictEqual(
            verifySessionToken(bad, SECRET),
            false,
            `malformed token rejected: ${String(bad)}`
        );
    }
}


/* 4. Expiry uses the existing TTL semantics (injected clock). */

{
    const token = createSessionToken(SECRET, {
        ttlMs: 100,
        now: () => 1000
    });

    assert.strictEqual(
        verifySessionToken(token, SECRET, { now: () => 1050 }),
        true,
        "token valid before expiry"
    );

    assert.strictEqual(
        verifySessionToken(token, SECRET, { now: () => 1200 }),
        false,
        "token rejected after expiry"
    );

    assert.strictEqual(
        DEFAULT_TTL_MS,
        8 * 60 * 60 * 1000,
        "session TTL preserved (8 hours)"
    );
}


/* 5. SESSION_SECRET is strictly required (fail closed). */

{
    assert.strictEqual(hasSessionSecret(""), false);
    assert.strictEqual(hasSessionSecret(undefined), false);
    assert.strictEqual(hasSessionSecret(SECRET), true);

    assert.throws(
        () => createSessionToken(""),
        /SESSION_SECRET is required/,
        "token creation fails without a dedicated secret"
    );

    const token = createSessionToken(SECRET);

    assert.strictEqual(
        verifySessionToken(token, ""),
        false,
        "verification fails closed without a secret"
    );
}


/* 6. Cookie attributes match the Node server's security posture. */

{
    assert.strictEqual(SESSION_COOKIE_OPTIONS.httpOnly, true);
    assert.strictEqual(SESSION_COOKIE_OPTIONS.secure, true);
    assert.strictEqual(SESSION_COOKIE_OPTIONS.sameSite, "strict");
    assert.strictEqual(SESSION_COOKIE_OPTIONS.path, "/");
    assert.strictEqual(SESSION_COOKIE_OPTIONS.maxAge, DEFAULT_TTL_MS);
    assert.strictEqual(SESSION_COOKIE, "ai_chat_session");
}


/* 7. Middleware: dev bypass, missing token, cookie, Bearer. */

function makeRes() {
    const res = { statusCode: null, body: null, headers: {} };
    res.status = code => { res.statusCode = code; return res; };
    res.json = payload => { res.body = payload; return res; };
    res.setHeader = (key, value) => { res.headers[key] = value; return res; };
    return res;
}

function run(auth, req) {
    const res = makeRes();
    let nexted = false;
    auth(req, res, () => { nexted = true; });
    return { res, nexted };
}

{
    const auth = createWorkerRequireAuth({
        authDisabled: false,
        apiToken: "secret123",
        sessionSecret: SECRET
    });

    /* Missing credentials -> 401. */
    let { res, nexted } = run(auth, { headers: {} });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(nexted, false);

    /* Valid signed session cookie -> allowed. */
    const token = createSessionToken(SECRET);
    ({ nexted } = run(auth, {
        headers: { cookie: `${SESSION_COOKIE}=${token}` }
    }));
    assert.strictEqual(nexted, true, "valid signed cookie allowed");

    /* Invalid cookie -> 401. */
    ({ res } = run(auth, {
        headers: { cookie: `${SESSION_COOKIE}=deadbeef` }
    }));
    assert.strictEqual(res.statusCode, 401);

    /* Bearer token still works. */
    ({ nexted } = run(auth, {
        headers: { authorization: "Bearer secret123" }
    }));
    assert.strictEqual(nexted, true, "bearer allowed");

    /* Bad bearer + bad cookie -> 401. */
    ({ res } = run(auth, {
        headers: {
            authorization: "Bearer wrong",
            cookie: `${SESSION_COOKIE}=nope`
        }
    }));
    assert.strictEqual(res.statusCode, 401);

    /* Dev no-auth mode allowed. */
    const devAuth = createWorkerRequireAuth({
        authDisabled: true,
        apiToken: "",
        sessionSecret: ""
    });
    ({ nexted } = run(devAuth, { headers: {} }));
    assert.strictEqual(nexted, true, "dev no-auth bypasses");

    /* No SERVER_API_TOKEN -> 503 (fails closed). */
    const noTokenAuth = createWorkerRequireAuth({
        authDisabled: false,
        apiToken: "",
        sessionSecret: SECRET
    });
    ({ res } = run(noTokenAuth, { headers: {} }));
    assert.strictEqual(res.statusCode, 503);
}


/* 8. No silent fallback to SERVER_API_TOKEN as the session key. */

{
    /* A token minted with the API token as the HMAC key must NOT be
       accepted when the dedicated session secret is absent. */
    const tokenMintedWithApiToken = createSessionToken("secret123");

    const authNoSecret = createWorkerRequireAuth({
        authDisabled: false,
        apiToken: "secret123",
        sessionSecret: undefined
    });

    const { res } = run(authNoSecret, {
        headers: { cookie: `${SESSION_COOKIE}=${tokenMintedWithApiToken}` }
    });

    assert.strictEqual(
        res.statusCode,
        401,
        "cookie signed with the API token is rejected (no fallback)"
    );

    /* And with the dedicated secret set, a token signed with the API
       token is likewise rejected. */
    const auth = createWorkerRequireAuth({
        authDisabled: false,
        apiToken: "secret123",
        sessionSecret: SECRET
    });

    const { res: res2 } = run(auth, {
        headers: { cookie: `${SESSION_COOKIE}=${tokenMintedWithApiToken}` }
    });

    assert.strictEqual(res2.statusCode, 401);
}


/* 8.5 Logout revocation (best-effort live per-isolate revocation set). */

{
    const token = createSessionToken(SECRET, {
        now: () => Date.now() + 10000
    });

    assert.strictEqual(
        verifySessionToken(token, SECRET),
        true,
        "token valid before revocation"
    );

    revokeSessionToken(token);

    assert.strictEqual(
        verifySessionToken(token, SECRET),
        false,
        "revoked token rejected even with a valid signature and expiry"
    );

    assert.strictEqual(
        afterLogoutVerifyAfterRevokeOnSameToken(token, SECRET),
        false,
        "revocation persists across verification calls"
    );

    const other = createSessionToken(SECRET);

    assert.strictEqual(
        verifySessionToken(other, SECRET),
        true,
        "unrelated token still verifies after another token was revoked"
    );

    /* Non-strings / empty revocations are safely ignored. */
    revokeSessionToken(null);
    revokeSessionToken("");
    revokeSessionToken(undefined);
}


function afterLogoutVerifyAfterRevokeOnSameToken(token, secret) {
    return verifySessionToken(token, secret);
}


/* 9. Worker sources never contain provider-key material. */

{
    for (const file of ["worker/session.js", "worker/auth.js"]) {
        const source = fs.readFileSync(
            path.join(repoRoot, file),
            "utf8"
        );

        assert.ok(
            !/sk-[A-Za-z0-9]{10,}|r8_[A-Za-z0-9]{10,}|Bearer\s+[A-Za-z0-9]{16,}/.test(source),
            `no secret-looking literals in ${file}`
        );
    }
}


console.log("Worker Session Auth: all tests passed.");
