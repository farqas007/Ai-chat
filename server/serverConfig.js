/* ===========================================================
   AI CHAT
   File : serverConfig.js
   Description : Server runtime configuration resolver
   (pure, no express dependency). Deployment-friendly:
   - PORT  : honors process.env.PORT, defaults to 3000,
             accepts "0" (ephemeral port on some platforms).
   - HOST  : defaults to 0.0.0.0 so hosting platforms that
             expect an externally reachable bind work out of
             the box; overridable with HOST=127.0.0.1.
   - CORS_ORIGIN : comma-separated allowlist (empty = same-origin).
   =========================================================== */

export function resolveServerConfig(env = {}) {

    const rawPort = String(env.PORT || "3000").trim();

    const parsedPort = Number.parseInt(rawPort, 10);

    const port =
        (/^\d+$/.test(rawPort) && Number.isInteger(parsedPort))
            ? parsedPort
            : 3000;

    const host =
        String(env.HOST || "0.0.0.0").trim() || "0.0.0.0";

    const allowedOrigins =
        String(env.CORS_ORIGIN || "")
            .split(",")
            .map(origin => origin.trim())
            .filter(Boolean);

    return {
        port,
        host,
        allowedOrigins
    };

}