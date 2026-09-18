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
   - TRUST_PROXY : comma-separated proxy subnet allowlist (off
                   by default; only explicitly configured values
                   are ever trusted).
   =========================================================== */

import net from "node:net";

/* A trusted proxy entry: an IP address, optionally with a CIDR
   prefix (e.g. "192.168.1.10" or "10.0.0.0/8"). Anything that is
   not a real IP/CIDR is rejected so a typo'd value can never
   become a trusted-proxy rule. */
function isValidSubnet(item) {

    const parts = item.split("/");

    if (parts.length > 2) {
        return false;
    }

    const family = net.isIP(parts[0]);

    if (!family) {
        return false;
    }

    if (parts.length === 1) {
        return true;
    }

    const prefix = Number.parseInt(parts[1].trim(), 10);

    if (!Number.isInteger(prefix)) {
        return false;
    }

    return prefix >= 0 && prefix <= (family === 4 ? 32 : 128);

}

/* ===========================================================
   TRUST_PROXY - reverse-proxy / load-balancer awareness (PH-04).

   Off by default (fail-safe): X-Forwarded-* headers coming from
   direct/untrusted clients are ignored, and req.ip stays the
   direct socket peer. IP-based rate limiting then keys on the
   REAL client connection, never on a spoofable header.

   When the app is deployed behind a trusted reverse proxy /
   load balancer that terminates TLS and adds X-Forwarded-For,
   the operator must configure TRUST_PROXY so req.ip (and the
   rate limiter) resolve to the real client instead of pooling
   every request into the proxy's IP.

   Accepted values (Express "trust proxy"), comma separators
   allowed for a subnet allowlist:
     - false             : never trust forwarded headers (default)
     - true              : trust ALL proxies (explicit opt-in only)
     - <number>          : trust that many hops back from the peer
     - loopback          : trust loopback proxies only
     - 1.2.3.4 or 1.2.3.0/24 : trust the listed proxy addresses
   Unrecognized / empty values resolve to false (fail closed).
=========================================================== */

function resolveTrustProxy(raw) {

    const value = String(raw || "").trim();

    if (!value) {
        return false;
    }

    if (value === "false") {
        return false;
    }

    if (value === "true") {
        return true;
    }

    if (value === "loopback") {
        return "loopback";
    }

    if (/^\d+$/.test(value)) {
        return Number.parseInt(value, 10);
    }

    const subnets = value
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

    if (subnets.length > 0 && subnets.every(isValidSubnet)) {
        return subnets;
    }

    return false;

}

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

    const trustProxy = resolveTrustProxy(env.TRUST_PROXY);

    return {
        port,
        host,
        allowedOrigins,
        trustProxy
    };

}