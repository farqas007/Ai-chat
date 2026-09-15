/* ===========================================================
   AI CHAT
   File : authMiddleware.js
   Description : Authentication middleware factory (pure, no express)
   =========================================================== */

import crypto from "crypto";

import {
    SESSION_COOKIE,
    getCookieValue
} from "./sessionAuth.js";

function safeEqual(a, b) {
    const bufferA = Buffer.from(String(a));
    const bufferB = Buffer.from(String(b));
    if (bufferA.length !== bufferB.length) {
        return false;
    }
    return crypto.timingSafeEqual(bufferA, bufferB);
}

// Builds the auth middleware from a resolved auth policy.
// Behavior matches the previous inline middleware exactly:
//  - dev "no auth" mode      -> allow through
//  - no token configured     -> 503 (fails closed)
//  - wrong/missing token     -> 401
//  - matching token          -> allow
// An optional sessionStore additionally accepts a valid
// browser session cookie (HttpOnly, cannot be read by JS).
// The Bearer-token path is unchanged.
export function createRequireAuth({ authDisabled, apiToken, sessionStore }) {

    return (req, res, next) => {

        if (authDisabled) {
            return next();
        }

        if (!apiToken) {
            return res.status(503).json({
                success: false,
                error: "SERVER_API_TOKEN is not configured. Set SERVER_API_TOKEN in production, or set ALLOW_NO_AUTH=true for local development only."
            });
        }

        if (sessionStore) {
            const sessionId = getCookieValue(
                req.headers.cookie,
                SESSION_COOKIE
            );
            if (sessionId && sessionStore.get(sessionId)) {
                return next();
            }
        }

        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : "";

        if (!token || !safeEqual(token, apiToken)) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized"
            });
        }

        next();
    };
}