/* ===========================================================
   AI CHAT
   File : authPolicy.js
   Description : Authentication policy resolution (pure, no express dependency)
   =========================================================== */

/* Security posture: authentication FAILS CLOSED.
 *
 *  - "no auth" (local development) mode is only reachable through an
 *    explicit opt-in: ALLOW_NO_AUTH=true, must NOT be in production,
 *    AND no SERVER_API_TOKEN must be configured.
 *  - A configured SERVER_API_TOKEN is ALWAYS enforced (the dev flag is
 *    ignored when a token is present), preventing a forgotten flag from
 *    opening the API.
 *  - Production with a missing token fails safely: protected routes stay
 *    unavailable and return a clear configuration error (503).
 */

export function resolveAuthPolicy(env = {}) {

    const nodeEnv = String(env.NODE_ENV || "development").trim().toLowerCase();

    const isProduction =
        nodeEnv === "production" || nodeEnv === "prod";

    const allowNoAuth =
        String(env.ALLOW_NO_AUTH || "") === "true";

    const apiToken =
        String(env.SERVER_API_TOKEN || "");

    const authDisabled =
        !isProduction && allowNoAuth && apiToken === "";

    return {
        isProduction,
        authDisabled,
        apiToken
    };
}