/* ===========================================================
   F5 — Path security guard tests (server/pathGuard.js).

   pathGuard.js is the shared path containment guard used by the
   server /file and /codex/analyze-file routes and by the CodeAgent
   file-operation handler. It is a pure module with no DOM or
   network dependency, so it is tested directly.

   Tests verify the CURRENT intended contract:
   isSensitivePath  — blocks private runtime files/dirs (.env,
                      *.bak, server/, memory/, backups/, root-level
                      bugs.json and memory.json). Sibling-prefix
                      names (serverX/, memoryX/) are NOT sensitive.
   isSafeEditPath   — rejects everything isSensitivePath blocks,
                      plus traversal, encoded traversal, absolute
                      paths, drive paths, backslashes, NUL bytes,
                      and any "%" (encoded input).

   No file system access, no network, no artifacts.
=========================================================== */

import assert from "node:assert";

import {
    isSensitivePath,
    isSafeEditPath
} from "../server/pathGuard.js";


let passed = 0;
let failed = 0;

function check(name, condition, message) {
    if (condition) {
        passed += 1;
        console.log(`PASS: ${name}`);
    } else {
        failed += 1;
        console.log(`FAIL: ${name} -- ${message || ""}`);
    }
}


/* -----------------------------------------------------------
   isSensitivePath — blocked values
----------------------------------------------------------- */

const sensitiveBlocked = [
    "",
    ".",
    ".env",
    ".env.example",
    ".env.production",
    "server/.env",
    "config.env",
    "a/.env.local",
    "notes.bak",
    "data/notes.txt.bak",
    "notes.BAK",
    "x.bak.bak",
    "server",
    "server/",
    "server/server.js",
    "server/lib/x.js",
    "memory",
    "memory/",
    "memory/project-memory.json",
    "backups",
    "backups/",
    "backups/snapshot.bak",
    "bugs.json",
    "memory.json",
    "SERVER/SERVER.JS",
    "SERVER\\SERVER.JS"
];

for (const p of sensitiveBlocked) {
    check(
        `isSensitivePath blocks "${p}"`,
        isSensitivePath(p) === true
    );
}


/* -----------------------------------------------------------
   isSensitivePath — allowed values (project files are editable)
----------------------------------------------------------- */

const sensitiveAllowed = [
    "package.json",
    "README.md",
    "js/app.js",
    "css/chat.css",
    "src/server.js",
    "serverX/file.txt",
    "memoryX/notes.txt",
    "backupsX/log.txt",
    "data/bugs.json",
    "data/memory.json",
    "server-notes.md",
    "aserver/thing.txt",
    "vendor/package.json"
];

for (const p of sensitiveAllowed) {
    check(
        `isSensitivePath allows "${p}"`,
        isSensitivePath(p) === false
    );
}


/* -----------------------------------------------------------
   isSafeEditPath — rejected inputs
----------------------------------------------------------- */

const editBlocked = [
    undefined,
    null,
    "",
    42,
    ".",
    "..",
    "../package.json",
    "a/../../package.json",
    "a/..",
    "sub/..",
    "../../../etc/passwd",
    "/etc/passwd",
    "/server/server.js",
    "//etc/hostname",
    "C:\\evil.txt",
    "C:evil.txt",
    "c:/weird",
    "D:\\x\\y.txt",
    "a\\b.txt",
    "..\\evil.txt",
    "%2e%2e/x",
    "%252e%252e/x",
    "js%2f..%2f..%2fserver",
    "file%00.txt",
    "a\0b.txt",
    ".env",
    ".env.example",
    "server/server.js",
    "memory/notes.txt",
    "backups/x.bak",
    "bugs.json",
    "memory.json",
    "server",
    "memory",
    "backups",
    "x/../.env"
];

for (const p of editBlocked) {
    check(
        `isSafeEditPath rejects ${typeof p === "string" ? `"${p}"` : String(p)}`,
        isSafeEditPath(p) === false
    );
}


/* -----------------------------------------------------------
   isSafeEditPath — accepted inputs (inside the project root)
----------------------------------------------------------- */

const editAllowed = [
    "package.json",
    "README.md",
    "js/app.js",
    "js/ui.js",
    "src/notes.txt",
    "a/b/c.txt",
    "./js/app.js",
    "a/../b.txt",
    "serverX/file.txt",
    "data/bugs.json",
    "docs/deep/nested/file.md",
    "style.css"
];

for (const p of editAllowed) {
    check(
        `isSafeEditPath allows "${p}"`,
        isSafeEditPath(p) === true
    );
}


console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}