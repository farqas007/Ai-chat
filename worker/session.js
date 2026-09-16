/* ===========================================================
   AI CHAT
   File : worker/session.js
   Description : Stateless, signed session cookies for the
   Cloudflare Workers target (pure, no express, no storage).

   Why stateless: Workers isolates are ephemeral and requests may
   land on different isolates, so the Node server's process-global
   in-memory session Map cannot be used for production sessions.
   A signed token carries its own expiry and is verified with an
   HMAC keyed by a DEDICATED SESSION_SECRET.

   Security:
   - HMAC-SHA256 over the payload, compared timing-safely.
   - No fallback to SERVER_API_TOKEN: if SESSION_SECRET is absent,
     no token can be created or verified (fails closed).
   - The signed value is opaque and never contains the password,
     the API token, or any provider key.
   =========================================================== */

import crypto from "crypto";

import {
    SESSION_COOKIE,
    DEFAULT_TTL_MS
} from "../server/sessionAuth.js";

/* Token format: <base64url("v1.<expiresAtMs>")>.<base64url(hmac)>. */
const TOKEN_VERSION = "v1";

/* Cookie attributes: identical security posture to the Node server
   (server/server.js SESSION_COOKIE_OPTIONS). */
export const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: DEFAULT_TTL_MS
};

export { SESSION_COOKIE, DEFAULT_TTL_MS };

function hmac(payload, secret) {
    return crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("base64url");
}

/* True only for a non-empty string secret. Never falls back to any
   other value (e.g. SERVER_API_TOKEN). */
export function hasSessionSecret(secret) {
    return typeof secret === "string" && secret.length > 0;
}

/* Creates a signed session token. Throws when no dedicated secret is
   configured: callers must treat that as a configuration failure and
   fail closed rather than mint an unsigned/weak session. */
export function createSessionToken(secret, options = {}) {

    if (!hasSessionSecret(secret)) {
        throw new Error("SESSION_SECRET is required");
    }

    const ttlMs = Number.isInteger(options.ttlMs)
        ? options.ttlMs
        : DEFAULT_TTL_MS;

    const now = typeof options.now === "function"
        ? options.now()
        : Date.now();

    const payload = Buffer
        .from(`${TOKEN_VERSION}.${now + ttlMs}`, "utf8")
        .toString("base64url");

    return `${payload}.${hmac(payload, secret)}`;
}

/* Verifies a signed session token: correct HMAC (timing-safe) and not
   expired. Returns false for any malformed/absent input or missing
   secret. Never throws. */
export function verifySessionToken(token, secret, options = {}) {

    if (!hasSessionSecret(secret)) {
        return false;
    }

    if (typeof token !== "string" || token.length === 0) {
        return false;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
        return false;
    }

    const [payload, signature] = parts;

    if (payload.length === 0 || signature.length === 0) {
        return false;
    }

    const expected = hmac(payload, secret);

    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
        return false;
    }

    let decoded;

    try {
        decoded = Buffer.from(payload, "base64url").toString("utf8");
    }
    catch {
        return false;
    }

    const [version, expiresRaw] = decoded.split(".");

    if (version !== TOKEN_VERSION) {
        return false;
    }

    const expiresAt = Number.parseInt(expiresRaw, 10);

    if (!Number.isInteger(expiresAt)) {
        return false;
    }

    const now = typeof options.now === "function"
        ? options.now()
        : Date.now();

    return now < expiresAt;
}
