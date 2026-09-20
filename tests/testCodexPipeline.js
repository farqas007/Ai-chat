/* ===========================================================
   Integration test: codex file-operation pipeline.

   Exercises the full request → codexHandler → FileAgent → PatchEngine
   flow for create, edit (patch), and read-back, using a real temp
   directory. No API keys or network access required.
   =========================================================== */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FileAgent } from "../agent/fileAgent.js";
import { handleCodexRequest } from "../server/codexHandler.js";


const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-pipeline-"));
const agent = new FileAgent(root);

const codex = { files: agent, run: async () => ({}) };

const passed = [];
const failed = [];

function check(name, condition, msg) {
    if (condition) {
        passed.push(name);
        console.log(`PASS: ${name}`);
    } else {
        failed.push(name);
        console.log(`FAIL: ${name} -- ${msg || ""}`);
    }
}


/* 1. Create a file via the pipeline. */

const createRes = await handleCodexRequest(
    { action: "create", file: "src/app.js", content: "console.log('hello');" },
    codex
);
check("create returns 200", createRes.status === 200);
check("create reports success", createRes.json.success === true);
check("file exists on disk", fs.existsSync(path.join(root, "src/app.js")));


/* 2. Read back via the pipeline (/file route uses codex.files.read). */

const content = agent.read("src/app.js");
check("read returns file content", content === "console.log('hello');");


/* 3. Patch (edit) the file via the pipeline. */

const editRes = await handleCodexRequest(
    {
        action: "edit",
        file: "src/app.js",
        oldCode: "hello",
        newCode: "world"
    },
    codex
);
check("edit returns 200", editRes.status === 200);
check("edit reports success", editRes.json.success === true);

const patched = agent.read("src/app.js");
check("patch applied correctly", patched === "console.log('world');");


/* 4. Sensitive path is rejected by the pipeline. */

const sensitiveRes = await handleCodexRequest(
    { action: "create", file: ".env", content: "SECRET=x" },
    codex
);
check("sensitive path rejected", sensitiveRes.status === 403);
check("sensitive path reports denied", sensitiveRes.json.error === "Access denied");


/* 5. Traversal is rejected by the pipeline. */

const escapeRes = await handleCodexRequest(
    { action: "create", file: "../escape.txt", content: "bad" },
    codex
);
check("traversal rejected", escapeRes.status === 403);


/* 6. Non-existent edit target fails cleanly. */

const missingRes = await handleCodexRequest(
    { action: "edit", file: "nope.txt", oldCode: "a", newCode: "b" },
    codex
);
check("missing file edit returns error", missingRes.status === 404);


/* 7. Task pipeline (non-file) path still works. */

const taskRes = await handleCodexRequest(
    { task: "Create a website" },
    codex
);
check("task pipeline returns 200", taskRes.status === 200);


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}
