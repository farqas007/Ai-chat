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
    /* Support both the Web API Headers instance (native Worker path:
       request.headers has .get()) and the plain IncomingHttpHeaders
       object that Express delivers in req.headers (no .get()). Without
       the plain-object branch, Express-middleware rate limiters key
       every request as "unknown" and all users share one bucket. */
    const get = typeof headers.get === "function"
        ? name => headers.get(name)
        : name => headers[name] || headers[name.toLowerCase()] || null;

    const direct = get("cf-connecting-ip");
    if (direct) {
        return direct;
    }
    const forwarded = get("x-forwarded-for") || "";
    const first = String(forwarded).split(",")[0].trim();
    if (first) {
        return first;
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
            const cutoff = Date.now() - windowMs * 2;
            for (const [k, v] of buckets) {
                if (v.length === 0 || v[v.length - 1] < cutoff) {
                    buckets.delete(k);
                }
            }
        }

        if (buckets.size > MAX_BUCKETS) {
            const entries = [...buckets.entries()]
                .sort((a, b) => {
                    const aLast = a[1].length ? a[1][a[1].length - 1] : 0;
                    const bLast = b[1].length ? b[1][b[1].length - 1] : 0;
                    return aLast - bLast;
                });
            const toRemove = entries.slice(0, entries.length - MAX_BUCKETS + 1000);
            for (const [k] of toRemove) {
                buckets.delete(k);
            }
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