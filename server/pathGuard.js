/* ===========================================================
   AI CHAT
   File : pathGuard.js
   Description : Path validation for file operations (pure)
   =========================================================== */

import path from "path";
import fs from "fs";

// Secret/config file extensions that must never be read, edited or served.
// `.env` is matched by prefix rule below (segment name), these cover
// private keys, credential stores and Cloudflare secrets.
const SENSITIVE_EXTENSIONS = [
    ".pem",
    ".key",
    ".crt",
    ".p12",
    ".pfx",
    ".jks"
];

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
    // Cloudflare secrets file (secret store for worker bindings).
    if (
        normalized === ".dev.vars" ||
        normalized.startsWith(".dev.vars/") ||
        normalized.endsWith("/.dev.vars")
    ) {
        return true;
    }
    // Git credential/config metadata.
    if (
        normalized.endsWith(".git/config") ||
        normalized.endsWith(".git/credentials")
    ) {
        return true;
    }
    // Private key / certificate material, anywhere in the path.
    for (const ext of SENSITIVE_EXTENSIONS) {
        if (normalized.endsWith(ext)) {
            return true;
        }
    }

    return false;
}

// Resolves `file` against `root` and returns the canonical absolute path
// only when it stays inside `root`. Returns null for escapes, absolute
// paths outside the root, NUL bytes and empty input. Shared by every
// write primitive so a single containment gate protects all callers.
// Uses fs.realpathSync on the resolved path (when it exists) to prevent
// symlink-based path traversal.
export function resolveInside(root, file) {
    if (
        typeof root !== "string" ||
        root.length === 0 ||
        typeof file !== "string" ||
        file.length === 0
    ) {
        return null;
    }

    try {
        const base = path.resolve(root);

        const fullPath = path.resolve(base, file);

        // Canonicalize both root and target. If the target exists on
        // disk, realpathSync resolves symlinks so a symlink pointing
        // outside the root is caught. If it does not yet exist (write
        // target), the resolved path without symlink following is used
        // — the containment check against the canonical base still
        // prevents escape via .. segments.
        let canonicalRoot;

        try {
            canonicalRoot = fs.realpathSync(base);
        } catch {
            canonicalRoot = base;
        }

        let canonicalPath;

        try {
            canonicalPath = fs.realpathSync(fullPath);
        } catch {
            canonicalPath = fullPath;
        }

        const relative = path.relative(canonicalRoot, canonicalPath);

        if (
            relative === "" ||
            relative.startsWith("..") ||
            path.isAbsolute(relative)
        ) {
            return null;
        }

        return fullPath;
    }
    catch {
        return null;
    }
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