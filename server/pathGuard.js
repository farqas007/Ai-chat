/* ===========================================================
   AI CHAT
   File : pathGuard.js
   Description : Path validation for file operations (pure)
   =========================================================== */

import path from "path";

// Block sensitive/private runtime files from being read, edited or served.
export function isSensitivePath(filePath) {
    const normalized = path.normalize(filePath)
        .replace(/\\/g, "/")
        .toLowerCase();

    if (normalized === "." || normalized === "") {
        return true;
    }
    if (normalized.includes(".env")) {
        return true;
    }
    if (normalized.endsWith(".bak")) {
        return true;
    }
    if (normalized === "server" || normalized.startsWith("server/")) {
        return true;
    }
    if (normalized === "memory" || normalized.startsWith("memory/")) {
        return true;
    }
    if (normalized === "backups" || normalized.startsWith("backups/")) {
        return true;
    }
    if (normalized === "bugs.json" || normalized === "memory.json") {
        return true;
    }

    return false;
}

// Validates a client-supplied relative path before any file write.
// Rejects traversal, encoded traversal, absolute paths, drive paths,
// backslashes, NUL bytes and sensitive runtime paths. The FileAgent's
// resolveInside() remains the final, independent containment gate.
export function isSafeEditPath(file) {

    if (typeof file !== "string" || file.length === 0) {
        return false;
    }

    if (file.includes("\0")) {
        return false;
    }

    // No file name needs percent-encoding in this project. Rejecting "%"
    // outright makes encoded traversal ("%2e%2e", "%252e", "%2f", ...)
    // impossible at every level of decoding.
    if (file.includes("%")) {
        return false;
    }

    if (file.includes("\\")) {
        return false;
    }

    if (/^[a-zA-Z]:/.test(file)) {
        return false;
    }

    const normalized = path.normalize(file);

    if (
        normalized === "" ||
        normalized === "." ||
        path.isAbsolute(normalized)
    ) {
        return false;
    }

    if (normalized.startsWith("..")) {
        return false;
    }

    const segments = normalized.split("/");

    if (segments.some(segment => segment === "..")) {
        return false;
    }

    return !isSensitivePath(normalized);
}