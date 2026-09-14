/* ===========================================================
   AI CHAT
   File : taskParser.js
   Description : Pure extraction helpers for natural-language edit tasks
   =========================================================== */

const FILE_TOKEN =
    /\b([\w./-]+\.(?:html|css|js|mjs|cjs|jsx|ts|tsx|json|md|txt|py|java|cpp|c|php|scss|svg))\b/i;

// Pulls the first file-ish token out of a task, e.g. "index.html" or
// "js/app.js". Relative traversal tokens ("../evil.txt") are matched too
// and rejected later by the path guards.
export function extractFileName(task) {
    if (typeof task !== "string") {
        return null;
    }
    const match = task.match(FILE_TOKEN);
    if (!match) {
        return null;
    }
    return match[1].replace(/^\.\//, "");
}

const OLD_NEW_PATTERNS = [
    /from\s+["']?([^"']+?)["']?\s+to\s+["']?([^"']+?)["']?(?:\s+in\s+[\w./-]+\.\w+[.,]?)?$/i,
    /replace\s+["']?([^"']+?)["']?\s+with\s+["']?([^"']+?)["']?(?:\s+in\s+[\w./-]+\.\w+[.,]?)?$/i,
    /"([^"]+)"\s+to\s+"([^"]+)"(?:[\s.,]*(?:in\s+[\w./-]+\.\w+)?[.,]?)?$/i
];

// Extracts the old/new content pair from phrases like:
//   "... from X to Y", "... replace X with Y", 'change "X" to "Y"'
export function extractPatch(task) {
    if (typeof task !== "string") {
        return null;
    }
    const text = task.trim();
    if (!text) {
        return null;
    }
    for (const pattern of OLD_NEW_PATTERNS) {
        const match = text.match(pattern);
        if (!match) {
            continue;
        }
        const oldCode = String(match[1] ?? "").trim();
        const newCode = String(match[2] ?? "").trim();
        if (oldCode.length === 0 || newCode.length === 0) {
            continue;
        }
        return { oldCode, newCode };
    }
    return null;
}

// Fallback keyword for locating a file when the task names no extension.
// e.g. "update the login page" -> "login"
export function extractKeyword(task) {
    if (typeof task !== "string") {
        return null;
    }
    const match = task.match(/\b([\w-]+)\s+(?:file|page|component|script|stylesheet)\b/i);
    return match ? match[1] : null;
}

// Detects traversal / encoded-traversal / backslash path tokens hidden in
// natural language. Returns true when the task should be rejected outright,
// before any file name is trusted.
export function isSuspiciousPathToken(task) {
    if (typeof task !== "string") {
        return false;
    }
    return (
        /\.\.\//.test(task) ||
        /%2e|%2f|%252e|%252f/i.test(task) ||
        /\\/.test(task)
    );
}