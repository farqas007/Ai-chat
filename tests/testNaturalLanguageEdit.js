import fs from "fs";
import os from "os";
import path from "path";
import { CodeAgent } from "../agent/codeAgent.js";
import { handleCodexRequest } from "../server/codexHandler.js";


const passed = [];
const failed = [];

function assert(name, condition) {
    if (condition) {
        passed.push(name);
        console.log(`PASS: ${name}`);
    } else {
        failed.push(name);
        console.log(`FAIL: ${name}`);
    }
}


const root = fs.mkdtempSync(path.join(os.tmpdir(), "nl-edit-"));
const indexHtml = path.join(root, "index.html");
const notesTxt = path.join(root, "notes.txt");
const envFile = path.join(root, ".env");

fs.writeFileSync(indexHtml, "<button>Hello World</button>");
fs.writeFileSync(notesTxt, "Old Title\nsubtitle");
fs.writeFileSync(envFile, "SECRET=keep");
fs.mkdirSync(path.join(root, "pages"), { recursive: true });
fs.writeFileSync(path.join(root, "pages", "about.html"), "<h1>About</h1>");

const agent = new CodeAgent({ root });


// 1. Natural-language find -> read -> patch -> edit end-to-end.
const graph = await agent.run(
    "Change the button text in index.html from Hello World to Welcome"
);

assert("successful edit: no failed steps", graph.every(s => s.status !== "failed"));
assert("successful edit: all steps done", graph.every(s => s.status === "done"));

const fileStep = graph.find(s => s.type === "file" && s.action === "edit");
assert(
    "file edit step reported success",
    fileStep && fileStep.result && fileStep.result.success === true
);

assert(
    "on-disk content updated",
    fs.readFileSync(indexHtml, "utf8") === "<button>Welcome</button>"
);

// 2. Successful task through the /codex handler (accurate success result).
const successOutcome = await handleCodexRequest(
    { task: "update notes.txt from Old Title to New Heading" },
    agent
);
assert(
    "handler returns accurate success for a completed edit",
    successOutcome.status === 200 &&
    successOutcome.json.success === true
);
assert(
    "handled edit applied to disk",
    fs.readFileSync(notesTxt, "utf8") === "New Heading\nsubtitle"
);

// 3. Old content not found -> clear failure, no edit applied.
const oldBefore = fs.readFileSync(indexHtml, "utf8");
const mismatchGraph = await agent.run(
    "Change the greeting in index.html from Missing Phrase to Hi"
);
const failedSteps = mismatchGraph.filter(s => s.status === "failed");
assert(
    "old content not found: exactly one failed step (patch)",
    failedSteps.length === 1 && failedSteps[0].type === "patch"
);
assert(
    "old content not found: clear error",
    failedSteps[0].result &&
    failedSteps[0].result.error === "Old code not found"
);
assert(
    "old content not found: dependent steps left pending",
    mismatchGraph.some(s => s.status === "pending")
);
assert(
    "old content not found: no edit step executed",
    !mismatchGraph.some(s => s.type === "file" && s.status === "done")
);
assert("old content not found: file unchanged", fs.readFileSync(indexHtml, "utf8") === oldBefore);

// 4. Missing file -> clear failure at find step.
const missingGraph = await agent.run(
    "Change the content in missing.html from X to Y"
);
const missingFailed = missingGraph.filter(s => s.status === "failed");
assert(
    "missing file: find step failed",
    missingFailed.length === 1 && missingFailed[0].type === "find"
);
assert(
    "missing file: clear error",
    missingFailed[0].result && missingFailed[0].result.error === "File not found"
);

// 5. Traversal -> rejected, nothing written outside.
const traversalGraph = await agent.run(
    "Change the content in ../escape.txt from A to B"
);
const traversalFailed = traversalGraph.filter(s => s.status === "failed");
assert(
    "traversal: rejected at find step",
    traversalFailed.length === 1 &&
    traversalFailed[0].type === "find" &&
    traversalFailed[0].result.error === "Access denied"
);
assert(
    "traversal: no file written outside sandbox",
    !fs.existsSync(path.join(path.dirname(root), "escape.txt"))
);

// 6. Encoded traversal -> rejected.
const encodedGraph = await agent.run(
    "change the content in %2e%2e/escape.txt from A to B"
);
const encodedFailed = encodedGraph.filter(s => s.status === "failed");
assert(
    "encoded traversal: rejected",
    encodedFailed.length === 1 &&
    encodedFailed[0].type === "find" &&
    encodedFailed[0].result.error === "Access denied"
);

// 7. Sensitive paths -> rejected, never modified.
const sensitiveGraph = await agent.run(
    "Change the header in server/server.js from X to Y"
);
const sensitiveFailed = sensitiveGraph.filter(s => s.status === "failed");
assert(
    "sensitive 'server/...': rejected",
    sensitiveFailed.length === 1 &&
    sensitiveFailed[0].type === "find" &&
    sensitiveFailed[0].result.error === "Access denied"
);

const envBefore = fs.readFileSync(envFile, "utf8");
const envGraph = await agent.run(
    "Change the config in .env from A to B"
);
assert(
    ".env task: find step failed safely",
    envGraph.some(s => s.status === "failed" && s.type === "find") &&
    envGraph.every(s => s.type !== "file" || s.status === "pending")
);
assert(".env never modified", fs.readFileSync(envFile, "utf8") === envBefore);

// 8. TaskGraph failure propagation: no fake success at the handler level.
const failureOutcome = await handleCodexRequest(
    { task: "Change the greeting in index.html from Missing to Hi" },
    agent
);
assert(
    "handler: failed task never reports success",
    failureOutcome.status === 400 &&
    failureOutcome.json.success === false &&
    failureOutcome.json.error === "Task could not be completed"
);

// 9. Failed filesystem operation surfaces a clear error (edit a directory).
fs.mkdirSync(path.join(root, "block.txt"), { recursive: true });
const patchDep = {
    id: 1,
    type: "patch",
    status: "done",
    startedAt: Date.now(),
    finishedAt: Date.now(),
    result: {
        success: true,
        action: { action: "edit", file: "block.txt", oldCode: "a", newCode: "b" }
    }
};
const editStep = {
    id: 2,
    type: "file",
    action: "edit",
    priority: 1,
    dependsOn: [1],
    status: "pending"
};
const fsResult = await agent.execute(editStep, [patchDep]);
assert(
    "failed filesystem op returned as a clear error",
    fsResult && fsResult.success === false &&
    typeof fsResult.error === "string" &&
    fsResult.error.length > 0
);

// 10. Natural-language create flow still works end-to-end.
const createGraph = await agent.run("Create a login page");
assert(
    "create flow: all steps done",
    createGraph.every(s => s.status === "done")
);
assert(
    "create flow: generated file exists",
    fs.existsSync(path.join(root, "generated-project", "login.html"))
);

// 11. Unmatched generation task: must NOT report success, must not touch disk.
function listTree(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listTree(p));
        else out.push(p);
    }
    return out.sort();
}

const filesBefore = listTree(root);
const unmatchedGraph = await agent.run(
    "Explain the theory of relativity in simple terms"
);
const unmatchedCreate = unmatchedGraph.find(
    s => s.type === "file" && s.action === "create"
);
assert(
    "unmatched task: file create step failed",
    unmatchedCreate && unmatchedCreate.status === "failed"
);
assert(
    "unmatched task: clear error on file create",
    unmatchedCreate.result &&
    unmatchedCreate.result.success === false &&
    typeof unmatchedCreate.result.error === "string" &&
    unmatchedCreate.result.error.length > 0
);

const unmatchedOutcome = await handleCodexRequest(
    { task: "Explain the theory of relativity in simple terms" },
    agent
);
assert(
    "handler: unmatched generation never reports success",
    unmatchedOutcome.status === 400 &&
    unmatchedOutcome.json.success === false &&
    unmatchedOutcome.json.error === "Task could not be completed"
);
assert(
    "unmatched task: no files created or modified",
    JSON.stringify(filesBefore) === JSON.stringify(listTree(root))
);


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}