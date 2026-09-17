/* ===========================================================
   Test: core/sessionManager.js — session id containment and
   safe file operations (SEC-04 / BUG-20).

   A client-supplied session id must never escape the sessions
   directory: traversal, separators, backslashes, NUL bytes,
   leading dots and oversized ids are refused; listing tolerates
   corrupt files; create/load/save/delete round-trip cleanly.
   =========================================================== */

import assert from "node:assert";

import fs from "node:fs";

import os from "node:os";

import path from "node:path";

import { SessionManager } from "../core/sessionManager.js";


const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "sessionManager-"));

const directory = path.join(tmpBase, "sessions");

const manager = new SessionManager(directory);


/* 1. Path traversal / malformed ids are refused everywhere. */

for (const bad of [
    "../evil",
    "../sessions/../evil",
    "a/b",
    "a\\b",
    "..",
    "..x",
    ".hidden",
    "/etc/passwd",
    "",
    "\0",
    "x".repeat(101)
]) {
    assert.strictEqual(
        manager.load(bad),
        null,
        `load refuses id ${JSON.stringify(bad)}`
    );

    assert.throws(
        () => manager.save({ id: bad }),
        /Invalid session id/,
        `save refuses id ${JSON.stringify(bad)}`
    );

    assert.throws(
        () => manager.delete(bad),
        /Invalid session id/,
        `delete refuses id ${JSON.stringify(bad)}`
    );
}


/* 2. Create / load / save / list round-trip. */

const created = manager.create("My Chat");

assert.strictEqual(typeof created.id, "string", "session gets an id");

const loaded = manager.load(created.id);

assert.strictEqual(loaded.id, created.id, "load returns the saved session");

assert.strictEqual(loaded.title, "My Chat", "title round-trips");

loaded.messages.push({ role: "user", content: "hi" });

manager.save(loaded);

const reloaded = manager.load(created.id);

assert.strictEqual(reloaded.messages.length, 1, "messages round-trip");

assert.ok(
    reloaded.updated >= created.updated,
    "save bumps the updated timestamp"
);

const list = manager.list();

assert.ok(
    list.some(s => s.id === created.id),
    "list includes the saved session"
);


/* 3. Corrupt session files are skipped in list, not fatal. */

fs.writeFileSync(
    path.join(directory, "corrupt.json"),
    "{ not valid json",
    "utf8"
);

const afterCorrupt = manager.list();

assert.strictEqual(
    afterCorrupt.length,
    1,
    "corrupt json file is skipped in list"
);

assert.ok(
    afterCorrupt.every(s => typeof s.id === "string"),
    "listed entries all expose a string id"
);


/* 4. Missing ids load as null, never throw. */

assert.strictEqual(
    manager.load("does-not-exist"),
    null,
    "load of unknown id returns null"
);


/* 5. delete removes the session file. */

manager.delete(created.id);

assert.strictEqual(
    manager.load(created.id),
    null,
    "deleted session no longer loads"
);


fs.rmSync(tmpBase, { recursive: true, force: true });


console.log("PASS: SessionManager id containment + safe file operations");