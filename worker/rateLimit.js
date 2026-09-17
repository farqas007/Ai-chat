/* ===========================================================
   AI CHAT
   File : worker/rateLimit.js
   Description : Best-effort in-memory rate limiting for the
   Cloudflare Workers target (pure, no express/hardware).

   IMPORTANT LIMITATION: Workers isolates are ephemeral. Each
   isolate keeps its own sliding-window bucket, so this limits
   traffic per-isolate, NOT globally. It mirrors the Node server's
   in-memory bucket behavior and stops a single client hammering a
   hot isolate; global rate limiting would require a shared binding
   (KV/Durable Objects) and is intentionally out of scope here.
   =========================================================== */

const DEFAULT_WINDOW_MS = 60 * 1000;

const MAX_BUCKETS = 50000;

const ERROR_MESSAGE = "Too many requests. Please try again shortly.";

function clientIp(headers = {}) {
    if (typeof headers.get === "function") {
        const direct = headers.get("cf-connecting-ip");
        if (direct) {
            return direct;
        }
        const forwarded = headers.get("x-forwarded-for") || "";
        const first = forwarded.split(",")[0].trim();
        if (first) {
            return first;
        }
    }
    return "unknown";
}

export function createRateLimiter({
    windowMs = DEFAULT_WINDOW_MS,
    max = 60
}) {

    const buckets = new Map();

    function isLimited(key) {
        if (buckets.size > MAX_BUCKETS) {
            buckets.clear();
        }

        const now = Date.now();

        const windowStart = now - windowMs;

        const recent = (buckets.get(key) || [])
            .filter(timestamp => timestamp > windowStart);

        if (recent.length >= max) {
            return true;
        }

        recent.push(now);

        buckets.set(key, recent);

        return false;
    }

    return {
        // Express middleware: rejects over-limit requests with the same
        // 429 JSON shape the Node server returns.
        middleware: (req, res, next) => {
            const key = `${clientIp(req.headers)}:${req.path || ""}`;
            if (isLimited(key)) {
                res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
                return res.status(429).json({
                    success: false,
                    error: ERROR_MESSAGE
                });
            }
            next();
        },

        // Native Workers path (no express req/res): returns true when the
        // request is allowed, false when the limit has been hit.
        allowRequest: (request, pathname) => {
            const key = `${clientIp(request.headers)}:${pathname || ""}`;
            return !isLimited(key);
        }
    };
}