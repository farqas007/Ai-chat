/* ===========================================================
   Test: browser session authentication.

   Covers:
   - login success
   - login failure
   - authenticated session access
   - unauthenticated access remains 401
   - existing Bearer authentication still works
   - logout invalidates the session
   - session expiry
   - HttpOnly/Secure/SameSite=Strict cookie options
=========================================================== */


import assert from "node:assert";

import fs from "node:fs";

import path from "node:path";

import { fileURLToPath } from "node:url";

import { createRequireAuth } from "../server/authMiddleware.js";

import {
    SESSION_COOKIE,
    secureEquals,
    getCookieValue,
    createSessionStore,
    loginResult
} from "../server/sessionAuth.js";


const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const repoRoot = path.join(__dirname, "..");


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


const cookieHeader = id => `${SESSION_COOKIE}=${id}`;


/* 1. Timing-safe comparison. */

assert.strictEqual(secureEquals("secret123", "secret123"), true);

assert.strictEqual(secureEquals("secret123", "wrong"), false);

assert.strictEqual(secureEquals("secret123", "AB"), false);

assert.strictEqual(secureEquals("", "secret123"), false);

assert.strictEqual(secureEquals("secret123", ""), false);


/* 2. Login success / failure (pure verification). */

{
    const store = createSessionStore();

    const failed = loginResult("wrong", "secret123", store);

    assert.strictEqual(failed.ok, false);

    assert.strictEqual(failed.status, 401);

    const unconfigured = loginResult("x", "", store);

    assert.strictEqual(unconfigured.ok, false);

    assert.strictEqual(unconfigured.status, 503);

    const success = loginResult("secret123", "secret123", store);

    assert.strictEqual(success.ok, true);

    assert.strictEqual(typeof success.sessionId, "string");

    assert.ok(success.sessionId.length >= 20, "session id is random");

    assert.strictEqual(store.get(success.sessionId), true);

}


/* 3. Session expiry (injected clock). */

{
    let now = 10000;

    const store = createSessionStore({ ttlMs: 100, now: () => now });

    const id = store.create();

    assert.strictEqual(store.get(id), true);

    now += 50;

    assert.strictEqual(store.get(id), true);

    now += 60;

    assert.strictEqual(store.get(id), false, "expired session rejected");

    assert.strictEqual(store.get("missing-id"), false);
}


/* 4. Middleware: cookie-gated access with a live session. */

{
    const store = createSessionStore();

    const auth = createRequireAuth({
        authDisabled: false,
        apiToken: "secret123",
        sessionStore: store
    });

    /* Unauthenticated request stays 401. */

    let { res } = run(auth, { headers: {} });

    assert.strictEqual(res.statusCode, 401);

    assert.strictEqual(res.body && res.body.success, false);

    /* Wrong/unknown session id still 401. */

    ({ res } = run(auth, { headers: { cookie: cookieHeader("deadbeef") } }));

    assert.strictEqual(res.statusCode, 401);

    /* Successful login grants authenticated access via cookie. */

    const { sessionId } = loginResult("secret123", "secret123", store);

    let { nexted } = run(auth, {
        headers: { cookie: cookieHeader(sessionId) }
    });

    assert.strictEqual(nexted, true, "valid cookie session allowed");

    /* Bearer authentication still works alongside the cookie store. */

    ({ nexted } = run(auth, {
        headers: { authorization: "Bearer secret123" }
    }));

    assert.strictEqual(nexted, true, "bearer still allowed");

    ({ nexted } = run(auth, {
        headers: { authorization: "Bearer wrong", cookie: cookieHeader("nope") }
    }));

    assert.strictEqual(nexted, false, "bad bearer + bad cookie rejected");

    /* Logout invalidates the session. */

    store.destroy(sessionId);

    ({ res } = run(auth, { headers: { cookie: cookieHeader(sessionId) } }));

    assert.strictEqual(res.statusCode, 401, "logged-out session rejected");

    /* Expired cookie session is rejected. */

    let now = 5000;

    const expiredStore = createSessionStore({ ttlMs: 100, now: () => now });

    const authExpired = createRequireAuth({
        authDisabled: false,
        apiToken: "secret123",
        sessionStore: expiredStore
    });

    const shortId = loginResult("secret123", "secret123", expiredStore).sessionId;

    now += 200;

    ({ res } = run(authExpired, { headers: { cookie: cookieHeader(shortId) } }));

    assert.strictEqual(res.statusCode, 401, "expired session rejected");
}


/* 5. Bearer-only middleware ignores cookies (unchanged behavior). */

{
    const store = createSessionStore();

    const auth = createRequireAuth({
        authDisabled: false,
        apiToken: "secret123"
    });

    const { sessionId } = loginResult("secret123", "secret123", store);

    let { res } = run(auth, { headers: { cookie: cookieHeader(sessionId) } });

    assert.strictEqual(
        res.statusCode,
        401,
        "without a sessionStore, cookies are ignored"
    );

    ({ res } = run(auth, { headers: {} }));

    assert.strictEqual(res.statusCode, 401);

    let { nexted } = run(auth, { headers: { authorization: "Bearer secret123" } });

    assert.strictEqual(nexted, true);

    ({ nexted } = run(auth, {
        headers: { authorization: "Bearer secret123", cookie: cookieHeader("x") }
    }));

    assert.strictEqual(nexted, true, "bearer still wins with cookies present");
}


/* 6. Dev no-auth mode is untouched. */

{
    const auth = createRequireAuth({
        authDisabled: true,
        apiToken: "",
        sessionStore: createSessionStore()
    });

    const { nexted } = run(auth, { headers: {} });

    assert.strictEqual(nexted, true, "dev no-auth still allows");
}


/* 7. Cookie helpers. */

assert.strictEqual(getCookieValue("", SESSION_COOKIE), null);

assert.strictEqual(getCookieValue("a=1; b=2", "a"), "1");

assert.strictEqual(
    getCookieValue(`foo=bar; ${SESSION_COOKIE}=xyz; baz=qux`, SESSION_COOKIE),
    "xyz"
);

assert.strictEqual(getCookieValue(`foo=bar`, SESSION_COOKIE), null);


/* 8. Session cookie carries the required security attributes. */

{
    const serverSource = fs.readFileSync(
        path.join(repoRoot, "server/server.js"),
        "utf8"
    );

    assert.ok(serverSource.includes("httpOnly: true"), "HttpOnly cookie");
    assert.ok(serverSource.includes("secure: true"), "Secure cookie");
    assert.ok(serverSource.includes('sameSite: "strict"'), "SameSite=Strict");
    assert.ok(serverSource.includes('path: "/"'), "Path=/");

    const authSource = fs.readFileSync(
        path.join(repoRoot, "server/authMiddleware.js"),
        "utf8"
    );

    assert.ok(
        authSource.includes("sessionStore"),
        "requireAuth accepts the session store"
    );
}


/* 9. No secret material in the auth module or cookie logic. */

{
    const source = fs.readFileSync(
        path.join(repoRoot, "server/sessionAuth.js"),
        "utf8"
    );

    assert.ok(
        !/sk-[A-Za-z0-9]{10,}|r8_[A-Za-z0-9]{10,}/.test(source),
        "no real-looking keys in sessionAuth.js"
    );
}


console.log("Session Auth: all tests passed.");