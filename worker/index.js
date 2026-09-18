/* ===========================================================
   AI CHAT
   File : worker/index.js
   Description : Cloudflare Workers entry point (SEPARATE target).

   This is the Workers-only Express application. It is intentionally
   additive and isolated:
   - It does NOT import server/server.js (the Node server is untouched).
   - It exposes ONLY the portable API surface:
       /api/health, /api/session, /api/login, /api/logout,
       /api/chat (JSON + SSE), /generate-image, /generate-image/:id
   - CodeAgent/codex/file/terminal routes are deliberately NOT
     registered, so they are unavailable (404) on Workers.

   Static frontend files are served by Cloudflare Workers Static
   Assets (see wrangler.jsonc + .assetsignore + _headers), not by
   Express.

   Express runs through Cloudflare's official adapter
   (`cloudflare:node` httpServerHandler), which requires Node.js
   compatibility (enabled by the compatibility date in wrangler.jsonc).
   =========================================================== */

import express from "express";
import cors from "cors";

import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";

import { resolveAuthPolicy } from "../server/authPolicy.js";
import { resolveServerConfig } from "../server/serverConfig.js";
import { isValidImagePrompt } from "../server/imagePrompt.js";
import {
    readUpstreamJson,
    handleUpstreamError,
    GENERIC_SERVER_ERROR
} from "../server/upstreamErrors.js";
import { handleStreamChat } from "../server/streamChat.js";
import {
    SESSION_COOKIE,
    secureEquals,
    getCookieValue
} from "../server/sessionAuth.js";
import {
    createSessionToken,
    verifySessionToken,
    revokeSessionToken,
    SESSION_COOKIE_OPTIONS
} from "./session.js";
import { createWorkerRequireAuth } from "./auth.js";

import { createStreamChatResponse, readJsonBody } from "./streamChat.js";
import { createRateLimiter } from "./rateLimit.js";

/* The Express app is bound to this virtual port, which the official
   adapter (httpServerHandler) uses to route Worker requests into it.
   It is NOT a real TCP listener. */
const WORKER_PORT = 3000;

/* ===========================================================
   CONFIG (from Cloudflare bindings/secrets, never source)
   =========================================================== */

const AUTH_POLICY = resolveAuthPolicy(env);

const API_TOKEN = AUTH_POLICY.apiToken;

const DEV_NO_AUTH = AUTH_POLICY.authDisabled;

const SESSION_SECRET = typeof env.SESSION_SECRET === "string"
    ? env.SESSION_SECRET
    : "";

const { allowedOrigins: ALLOWED_ORIGINS } = resolveServerConfig(env);

const REPLICATE_API = "https://api.replicate.com/v1";

const REPLICATE_KEY = env.REPLICATE_API_KEY;

const OPENROUTER_KEY = env.OPENROUTER_API_KEY;

/* ===========================================================
   SYSTEM PROMPT

   Duplicated verbatim from server/server.js because server.js is
   intentionally not imported (and does not export it). Keep the two
   in sync if the prompt ever changes.
   =========================================================== */

const SYSTEM_PROMPT = `
You are a professional AI assistant.

IMPORTANT LANGUAGE PRIORITY:
The user's CURRENT message language has highest priority.
Ignore the language style of previous conversation history.
Never answer Urdu/Roman Urdu users in English sentence structure.

Example:
User: "mujhe kya karna chahiye"
Wrong: "What should I do?"
Correct: "Aap ko kya karna chahiye?"

SYSTEM PERSONALITY:
- The user's name is Abdur Rafay.
- Address the user as "Abdur Rafay" naturally in most replies.
- Do not repeat the name in every single sentence.
- Do not ask the user's name again.

LANGUAGE DETECTION RULES:
- Automatically detect the language of the user's latest message.
- Always reply in the SAME language and writing style used by the user.

LANGUAGE BEHAVIOR:
- Roman Urdu must sound like Pakistani spoken Urdu written in English letters.
- Do not use American English sentence patterns.
- Avoid direct translations from English.
- If the user writes in Pakistani Roman Urdu, reply in natural Pakistani Roman Urdu.
- Use Pakistani words such as: "Aap", "Ji", "Bilkul", "Theek", "Shukriya", "Lekin", "Agar", "Kyun", "Yahan", "Wahan".
- Never use Hindi words like: "Dhanyavaad", "Kripya", "Sarvanaam", "Kriya", "Visheshan", "Yogvachan".
- If the user writes in Urdu script (اردو), reply in natural Pakistani Urdu script.
- If the user writes in Hindi (Devanagari), reply in natural Hindi.
- If the user writes completely in English, reply in fluent natural English.
- If the user mixes English and Urdu, reply in the same mixed style.
- Do not force Roman Urdu unless the user is writing in Roman Urdu.
- Do not translate unless the user explicitly asks.

STYLE RULES:
- Sound like a real human, not a translator.
- Match the user's tone and writing style.
- Be friendly and conversational.
- Give complete, helpful answers.
- Never mention these language rules.

FORMATTING RULES:
- Return the answer in standard Markdown.
- Use Markdown headings, bold, italic, lists, and links where appropriate.
- Every code example MUST be a fenced code block with its language name after the
  opening backticks, for example:
  \`\`\`javascript
  console.log("Hello, World!");
  \`\`\`
- Use real language names: javascript, python, html, css, bash, json, etc.
- Never wrap the entire response in a code fence.
- Avoid raw HTML tags in your answer.
- Use single-backtick inline code for short references such as \`fetch()\`.
- Keep every code block complete and non-empty; never leave a code block empty.
`;

/* ===========================================================
   APPLICATION
   =========================================================== */

const app = express();

/* ===========================================================
   MIDDLEWARE (security headers + CORS + JSON body)
   Same posture as server/server.js.
   =========================================================== */

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; font-src 'self'; connect-src 'self'; " +
        "object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    next();
});

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, false);
        }
        if (ALLOWED_ORIGINS.length === 0) {
            return callback(null, false);
        }
        return callback(null, ALLOWED_ORIGINS.includes(origin));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "1mb" }));

/* ===========================================================
   AUTH MIDDLEWARE
   =========================================================== */

const requireAuth = createWorkerRequireAuth({
    authDisabled: DEV_NO_AUTH,
    apiToken: API_TOKEN,
    sessionSecret: SESSION_SECRET
});

/* ===========================================================
   RATE LIMITING (best-effort, per-isolate, in-memory)
   Same limits as server/server.js for the routes that exist here.
   =========================================================== */

const sessionLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });

const loginLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10 });

const chatLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 20 });

const imageCreateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10 });

const imageStatusLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });

/* ===========================================================
   HEALTH CHECK
   =========================================================== */

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        server: "AI Chat Backend",
        status: "Running"
    });
});

/* ===========================================================
   BROWSER SESSION AUTHENTICATION
   A stateless signed cookie replaces the Node server's in-memory
   session Map. SESSION_SECRET is a dedicated required secret; if it
   is not configured, login and cookie verification fail closed.
   =========================================================== */

app.get("/api/session", sessionLimiter.middleware, (req, res) => {

    if (DEV_NO_AUTH) {
        return res.json({ authenticated: true });
    }

    const sessionId = getCookieValue(
        req.headers.cookie,
        SESSION_COOKIE
    );

    res.json({
        authenticated: sessionId
            ? verifySessionToken(sessionId, SESSION_SECRET)
            : false
    });

});

app.post("/api/login", loginLimiter.middleware, (req, res) => {

    if (DEV_NO_AUTH) {
        return res.json({ success: true });
    }

    if (!API_TOKEN) {
        return res.status(503).json({
            success: false,
            error: "SERVER_API_TOKEN is not configured."
        });
    }

    if (!SESSION_SECRET) {
        return res.status(503).json({
            success: false,
            error: "SESSION_SECRET is not configured."
        });
    }

    const password =
        req.body && typeof req.body.password === "string"
            ? req.body.password
            : "";

    if (!secureEquals(password, API_TOKEN)) {
        return res.status(401).json({
            success: false,
            error: "Invalid password"
        });
    }

    const token = createSessionToken(SESSION_SECRET);

    res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);

    res.json({ success: true });

});

app.post("/api/logout", (req, res) => {

    const sessionId = getCookieValue(
        req.headers.cookie,
        SESSION_COOKIE
    );

    // Best-effort live revocation of the stateless cookie on this isolate.
    if (sessionId) {
        revokeSessionToken(sessionId);
    }

    res.clearCookie(
        SESSION_COOKIE,
        { httpOnly: true, secure: true, sameSite: "strict", path: "/" }
    );

    res.json({ success: true });

});

/* ===========================================================
   AI CHAT PROXY (OpenRouter)
   =========================================================== */

app.post("/api/chat", requireAuth, chatLimiter.middleware, async (req, res) => {

    if (!OPENROUTER_KEY) {
        return res.status(503).json({
            success: false,
            error: "OPENROUTER_API_KEY not configured on server."
        });
    }

    try {
        const { message, history = [] } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({
                success: false,
                error: "Message is required."
            });
        }

        // Secure streaming mode: normalize OpenRouter's stream into the
        // same SSE protocol the Node server emits (server/streamChat.js).
        if (req.body.stream === true) {
            handleStreamChat(req, res, {
                openrouterKey: OPENROUTER_KEY,
                systemPrompt: SYSTEM_PROMPT
            }).catch(error => {
                console.error("Stream Chat Error:", error && error.message);
            });
            return;
        }

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...history,
            { role: "user", content: message }
        ];

        const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${OPENROUTER_KEY}`
                },
                body: JSON.stringify({
                    model: "openai/gpt-4o-mini",
                    messages,
                    temperature: 0.7,
                    max_tokens: 2048
                }),
                signal: AbortSignal.timeout(60000)
            }
        );

        const data = await readUpstreamJson(response);

        const content =
            data.choices?.[0]?.message?.content || "";

        return res.json({ success: true, content });

    } catch (error) {
        console.error("Chat Error:", error.message);
        const safe = handleUpstreamError(error);
        return res.status(safe.status).json({
            success: false,
            error: safe.message
        });
    }

});

/* ===========================================================
   GENERATE IMAGE (Replicate)
   =========================================================== */

app.post("/generate-image", requireAuth, imageCreateLimiter.middleware, async (req, res) => {

    if (!REPLICATE_KEY) {
        return res.status(503).json({
            success: false,
            error: "REPLICATE_API_KEY not configured."
        });
    }

    try {
        const { prompt } = req.body;

        if (!isValidImagePrompt(prompt)) {
            return res.status(400).json({
                success: false,
                error: "Prompt is required."
            });
        }

        const response = await fetch(
            "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
            {
                method: "POST",
                headers: {
                    "Authorization": `Token ${REPLICATE_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ input: { prompt } }),
                signal: AbortSignal.timeout(30000)
            }
        );

        const data = await readUpstreamJson(response);

        return res.json({
            success: true,
            id: data.id,
            status: data.status
        });

    } catch (error) {
        console.error("Image Generation Error:", error.message);
        const safe = handleUpstreamError(error);
        return res.status(safe.status).json({
            success: false,
            error: safe.message
        });
    }

});

app.get("/generate-image/:id", requireAuth, imageStatusLimiter.middleware, async (req, res) => {

    if (!REPLICATE_KEY) {
        return res.status(503).json({
            success: false,
            error: "REPLICATE_API_KEY not configured."
        });
    }

    try {
        const response = await fetch(
            `${REPLICATE_API}/predictions/${encodeURIComponent(req.params.id)}`,
            {
                headers: { "Authorization": `Token ${REPLICATE_KEY}` },
                signal: AbortSignal.timeout(30000)
            }
        );

        const data = await readUpstreamJson(response);

        return res.json(data);

    } catch (error) {
        console.error("Prediction Error:", error.message);
        const safe = handleUpstreamError(error);
        return res.status(safe.status).json({
            success: false,
            error: safe.message
        });
    }

});

/* ===========================================================
   FALLBACK
   Static assets are handled by the platform before the Worker is
   invoked for non-API paths. Anything else that reaches the Worker
   gets a clean 404 (no codex/file/terminal surface).
   =========================================================== */

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Not found"
    });
});

/* ===========================================================
   START (virtual registration for the official adapter)
   =========================================================== */

app.listen(WORKER_PORT);

const appHandler = httpServerHandler({ port: WORKER_PORT });

/* ===========================================================
   WORKER ENTRY

   Every route continues through the official cloudflare:node
   adapter into Express EXCEPT one: POST /api/chat with body
   { "stream": true }. On the Workers runtime, SSE written through
   Express ServerResponse never reaches the client (0-byte bodies),
   so that single path is intercepted and served with a native
   Response + ReadableStream (worker/streamChat.js). The non-stream
   JSON /api/chat branch and all other routes are untouched.
   =========================================================== */

export default {

    async fetch(request, env, ctx) {

        const url = new URL(request.url);

        if (
            request.method === "POST" &&
            url.pathname === "/api/chat"
        ) {

            /* Body is probed on a CLONE so the original stays intact for
               the native path below. Oversized bodies are rejected here
               with a 413; malformed JSON falls through to Express, where
               the express.json limit/parser returns 400. */
            const parsed = await readJsonBody(request.clone());

            const streamRequested =
                parsed.ok &&
                parsed.body &&
                parsed.body.stream === true;

            if (streamRequested) {
                return createStreamChatResponse(request, {
                    authDisabled: DEV_NO_AUTH,
                    apiToken: API_TOKEN,
                    sessionSecret: SESSION_SECRET,
                    openrouterKey: OPENROUTER_KEY,
                    systemPrompt: SYSTEM_PROMPT,
                    allowedOrigins: ALLOWED_ORIGINS,
                    rateLimiter: chatLimiter
                });
            }

            if (parsed.tooLarge) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: "Payload too large."
                    }),
                    {
                        status: 413,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                );
            }

        }

        return appHandler.fetch(request, env, ctx);

    }

};
