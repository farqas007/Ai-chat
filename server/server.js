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
   MIDDLEWARE
=========================================================== */

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "20mb" }));

/* ===========================================================
   STATIC FILES
=========================================================== */

app.use(express.static(path.join(__dirname, "..")));

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

app.get("/", (req, res) => {
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

app.post("/api/chat", async (req, res) => {
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
                })
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
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/* ===========================================================
   CODE AGENT
=========================================================== */

app.post("/codex", async (req, res) => {
    try {
        const { task } = req.body;

        if (!task) {
            return res.status(400).json({
                success: false,
                error: "Task required"
            });
        }

        const result = await codex.run(task);

        res.json({ success: true, result });

    } catch (error) {
        console.error("Codex Error:", error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get("/file", async (req, res) => {
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

        const content = codex.files.read(filePath);

        res.json({ success: true, path: filePath, content });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post("/codex/analyze-file", async (req, res) => {
    try {
        const { file } = req.body;

        if (!file) {
            return res.status(400).json({
                success: false,
                error: "File path required"
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

app.post("/generate-image", async (req, res) => {
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
                body: JSON.stringify({ input: { prompt } })
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
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get("/generate-image/:id", async (req, res) => {
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
                headers: { "Authorization": `Token ${REPLICATE_KEY}` }
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
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/* ===========================================================
   START SERVER
=========================================================== */

app.listen(PORT, () => {
    console.log(`AI Chat Server running on http://localhost:${PORT}`);
});
