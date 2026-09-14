/* ===========================================================
   AI CHAT
   File : server.js
   Description : AI Backend Server
=========================================================== */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { CodeAgent } from "../agent/codeAgent.js";
import { resolveAuthPolicy } from "./authPolicy.js";
import { createRequireAuth } from "./authMiddleware.js";
import { isPublicPathname } from "./staticGuard.js";
import { handleCodexRequest } from "./codexHandler.js";
import { isSensitivePath } from "./pathGuard.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

/* ===========================================================
   APPLICATION
=========================================================== */

const app = express();

const PORT = process.env.PORT || 3000;

const codex = new CodeAgent();

/* ===========================================================
   AUTH & CORS CONFIG
=========================================================== */

// Authentication FAILS CLOSED: local "no token" mode requires an explicit
// opt-in (ALLOW_NO_AUTH=true) and can never apply in production.
const AUTH_POLICY = resolveAuthPolicy(process.env);

const API_TOKEN = AUTH_POLICY.apiToken;

const DEV_NO_AUTH = AUTH_POLICY.authDisabled;

if (DEV_NO_AUTH) {
    console.warn(
        "AUTH: running in local development mode with authentication disabled " +
        "(ALLOW_NO_AUTH=true). Do NOT use this in production."
    );
}

if (AUTH_POLICY.isProduction && !API_TOKEN) {
    console.error(
        "SEC: NODE_ENV is production but SERVER_API_TOKEN is not set. " +
        "Protected endpoints are disabled until a token is configured."
    );
}

// Comma-separated allowlist, e.g. CORS_ORIGIN=https://app.example.com,https://dev.example.com
// Empty => same-origin requests only (no cross-origin website can call the API).
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

/* ===========================================================
   MIDDLEWARE
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
   RATE LIMITING (in-memory, per IP)
=========================================================== */

const rateBuckets = new Map();

function rateLimit({ windowMs, max }) {
    return (req, res, next) => {
        const key = `${req.ip || "unknown"}:${req.path}`;
        const now = Date.now();
        const windowStart = now - windowMs;

        if (rateBuckets.size > 50000) {
            rateBuckets.clear();
        }

        const recent = (rateBuckets.get(key) || [])
            .filter(timestamp => timestamp > windowStart);

        if (recent.length >= max) {
            res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
            return res.status(429).json({
                success: false,
                error: "Too many requests. Please try again shortly."
            });
        }

        recent.push(now);
        rateBuckets.set(key, recent);
        next();
    };
}

/* ===========================================================
   AUTH MIDDLEWARE
=========================================================== */

const requireAuth = createRequireAuth({
    authDisabled: DEV_NO_AUTH,
    apiToken: API_TOKEN
});

/* ===========================================================
   PATH GUARDS
=========================================================== */

// isSensitivePath is shared from server/pathGuard.js (used by /file,
// /codex/analyze-file and the codex file-operation handler).

/* ===========================================================
   CONFIG
=========================================================== */

const REPLICATE_API = "https://api.replicate.com/v1";

const REPLICATE_KEY = process.env.REPLICATE_API_KEY;

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

if (!REPLICATE_KEY) {
    console.warn("REPLICATE_API_KEY not set - image generation disabled.");
}

if (!OPENROUTER_KEY) {
    console.warn("OPENROUTER_API_KEY not set - AI chat will not work.");
}

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
   AI CHAT PROXY
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
- Return valid HTML only.
- Use <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <code>, <br>, and <pre class="code-block"><code> where appropriate.
- Do NOT return Markdown syntax like **bold** or triple-backtick code fences.
- Do NOT wrap the response inside code fences.
- Do NOT escape HTML tags.
- Return clean HTML that can be rendered directly.
- For code, use <pre class="code-block"><code>language code here</code></pre>.
`;

app.post("/api/chat",
    requireAuth,
    rateLimit({ windowMs: 60 * 1000, max: 20 }),
    async (req, res) => {
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

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error?.message ||
                data.message ||
                "OpenRouter API Error"
            );
        }

        const content =
            data.choices?.[0]?.message?.content || "";

        return res.json({ success: true, content });

    } catch (error) {
        console.error("Chat Error:", error.message);
        if (error.name === "TimeoutError" || error.name === "AbortError") {
            return res.status(504).json({
                success: false,
                error: "Upstream timed out. Please try again."
            });
        }
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/* ===========================================================
   CODE AGENT
=========================================================== */

app.post("/codex",
    requireAuth,
    rateLimit({ windowMs: 60 * 1000, max: 5 }),
    async (req, res) => {
    try {
        const outcome = await handleCodexRequest(
            req.body,
            codex
        );

        return res.status(outcome.status).json(outcome.json);

    } catch (error) {
        console.error("Codex Error:", error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get("/file",
    requireAuth,
    rateLimit({ windowMs: 60 * 1000, max: 60 }),
    async (req, res) => {
    try {
        const filePath = req.query.path;

        if (!filePath) {
            return res.status(400).json({
                success: false,
                error: "File path missing"
            });
        }

        const normalized = path.normalize(filePath);
        if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
            return res.status(403).json({
                success: false,
                error: "Access denied"
            });
        }

        if (isSensitivePath(normalized)) {
            return res.status(403).json({
                success: false,
                error: "Access denied"
            });
        }

        const content = codex.files.read(filePath);

        if (content === null || content === undefined) {
            return res.status(404).json({
                success: false,
                error: "File not found"
            });
        }

        res.json({ success: true, path: filePath, content });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post("/codex/analyze-file",
    requireAuth,
    rateLimit({ windowMs: 60 * 1000, max: 30 }),
    async (req, res) => {
    try {
        const { file } = req.body;

        if (!file) {
            return res.status(400).json({
                success: false,
                error: "File path required"
            });
        }

        const normalized = path.normalize(file);
        if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
            return res.status(403).json({
                success: false,
                error: "Access denied"
            });
        }

        if (isSensitivePath(normalized)) {
            return res.status(403).json({
                success: false,
                error: "Access denied"
            });
        }

        const analysis = codex.analyzeFile(file);

        if (!analysis) {
            return res.status(404).json({
                success: false,
                error: "File analysis failed"
            });
        }

        return res.json({ success: true, analysis });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/* ===========================================================
   GENERATE IMAGE
=========================================================== */

app.post("/generate-image",
    requireAuth,
    rateLimit({ windowMs: 60 * 1000, max: 10 }),
    async (req, res) => {
    if (!REPLICATE_KEY) {
        return res.status(503).json({
            success: false,
            error: "REPLICATE_API_KEY not configured."
        });
    }

    try {
        const { prompt } = req.body;

        if (!prompt || !prompt.trim()) {
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

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: data.detail || data.title || "Replicate API Error"
            });
        }

        return res.json({
            success: true,
            id: data.id,
            status: data.status
        });

    } catch (error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
            return res.status(504).json({
                success: false,
                error: "Upstream timed out. Please try again."
            });
        }
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get("/generate-image/:id",
    requireAuth,
    rateLimit({ windowMs: 60 * 1000, max: 60 }),
    async (req, res) => {
    if (!REPLICATE_KEY) {
        return res.status(503).json({
            success: false,
            error: "REPLICATE_API_KEY not configured."
        });
    }

    try {
        const response = await fetch(
            `${REPLICATE_API}/predictions/${req.params.id}`,
            {
                headers: { "Authorization": `Token ${REPLICATE_KEY}` },
                signal: AbortSignal.timeout(30000)
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: data.detail || data.title || "Prediction Error"
            });
        }

        return res.json(data);

    } catch (error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
            return res.status(504).json({
                success: false,
                error: "Upstream timed out. Please try again."
            });
        }
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/* ===========================================================
   STATIC FILES (allowlist, at the end so API routes win)
=========================================================== */

// Only serves GET/HEAD for the public web app (index.html, css/, js/).
app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
        return res.status(404).json({
            success: false,
            error: "Not found"
        });
    }

    if (!isPublicPathname(req.path)) {
        return res.status(404).json({
            success: false,
            error: "Not found"
        });
    }

    next();
});

app.use(express.static(path.join(__dirname, ".."), {
    dotfiles: "deny",
    index: "index.html"
}));

/* ===========================================================
   START SERVER
=========================================================== */

app.listen(PORT, () => {
    console.log(`AI Chat Server running on http://localhost:${PORT}`);
});
