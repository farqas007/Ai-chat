/* ===========================================================
   AI CHAT
   File : worker/auth.js
   Description : Authentication middleware for the Cloudflare
   Workers target (pure, no express).

   Behavior mirrors server/authMiddleware.js:
   - dev "no auth" mode      -> allow through
   - no token configured     -> 503 (fails closed)
   - valid signed session    -> allow
   - wrong/missing token     -> 401

   Session cookies are stateless signed tokens (worker/session.js)
   keyed by a DEDICATED SESSION_SECRET. There is NO fallback to
   SERVER_API_TOKEN: when SESSION_SECRET is missing, cookie sessions
   simply cannot verify and the request falls through to the 401 /
   Bearer path (fail closed).
   =========================================================== */

import {
    SESSION_COOKIE,
    getCookieValue,
    secureEquals
} from "../server/sessionAuth.js";

import { verifySessionToken } from "./session.js";

export function createWorkerRequireAuth({
    authDisabled,
    apiToken,
    sessionSecret
}) {

    return (req, res, next) => {

        if (authDisabled) {
            return next();
        }

        if (!apiToken) {
            return res.status(503).json({
                success: false,
                error: "SERVER_API_TOKEN is not configured. Set SERVER_API_TOKEN in production."
            });
        }

        const sessionId = getCookieValue(
            req.headers.cookie,
            SESSION_COOKIE
        );

        if (sessionId && verifySessionToken(sessionId, sessionSecret)) {
            return next();
        }

        const header = req.headers.authorization || "";

        const token = header.startsWith("Bearer ")
            ? header.slice(7)
            : "";

        if (!token || !secureEquals(token, apiToken)) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized"
            });
        }

        next();

    };

}
