/* ===========================================================
   AI CHAT
   File : sessionAuth.js
   Description : Browser session authentication (pure, no express).
   SERVER_API_TOKEN is verified server-side only; the browser only
   ever receives an HttpOnly session cookie that cannot be read by
   JavaScript.
   =========================================================== */

import crypto from "crypto";


/* The cookie name used for browser sessions. */

export const SESSION_COOKIE = "ai_chat_session";


/* Session lifetime: 8 hours. */

export const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;


/* ===========================================================
   TIMING-SAFE COMPARISON
   Same semantics as server/authMiddleware.js safeEqual.
=========================================================== */

export function secureEquals(a, b) {

    const bufferA = Buffer.from(String(a));

    const bufferB = Buffer.from(String(b));

    const maxLen = Math.max(bufferA.length, bufferB.length);

    if (maxLen === 0) {

        return bufferA.length === bufferB.length;

    }

    const paddedA = Buffer.alloc(maxLen, 0);

    const paddedB = Buffer.alloc(maxLen, 0);

    bufferA.copy(paddedA);

    bufferB.copy(paddedB);

    const result = crypto.timingSafeEqual(paddedA, paddedB);

    return result && bufferA.length === bufferB.length;

}


/* ===========================================================
   COOKIE PARSING
   Reads a named cookie value from a raw Cookie header.
=========================================================== */

export function getCookieValue(header, name) {

    if (typeof header !== "string" || header === "") {

        return null;

    }

    for (const part of header.split(";")) {

        const index = part.indexOf("=");

        if (index === -1) {

            continue;

        }

        const key = part.slice(0, index).trim();

        if (key === name) {

            return part.slice(index + 1).trim();

        }

    }

    return null;

}


/* ===========================================================
   SESSION STORE
   In-memory map of random session ids with expiry,
   mirroring the existing rateBuckets memory pattern.
=========================================================== */

export function createSessionStore(options = {}) {

    const ttlMs = options.ttlMs || DEFAULT_TTL_MS;

    const now = options.now || Date.now;

    const sessions = new Map();

    return {

        /* Create a session, returning a random id. */

        create() {

            if (sessions.size > 10000) {

                for (const [id, expiresAt] of sessions) {

                    if (now() >= expiresAt) {

                        sessions.delete(id);

                    }

                }

            }

            const id = crypto.randomBytes(32).toString("hex");

            sessions.set(id, now() + ttlMs);

            return id;

        },

        /* True only when the id exists and has not expired. */

        get(id) {

            if (typeof id !== "string" || id === "") {

                return false;

            }

            const expiresAt = sessions.get(id);

            if (expiresAt === undefined) {

                return false;

            }

            if (now() >= expiresAt) {

                sessions.delete(id);

                return false;

            }

            return true;

        },

        /* Invalidate a session (logout). */

        destroy(id) {

            if (typeof id === "string" && id !== "") {

                sessions.delete(id);

            }

        },

        size() {

            return sessions.size;

        }

    };

}


/* ===========================================================
   LOGIN RESULT
   Pure verification used by POST /api/login.
   Returns { ok, sessionId } on success, or { ok, status, error }.
=========================================================== */

export function loginResult(password, apiToken, store) {

    if (!apiToken) {

        return {
            ok: false,
            status: 503,
            error: "SERVER_API_TOKEN is not configured."
        };

    }

    if (!secureEquals(String(password || ""), apiToken)) {

        return {
            ok: false,
            status: 401,
            error: "Invalid password"
        };

    }

    return {
        ok: true,
        sessionId: store.create()
    };

}