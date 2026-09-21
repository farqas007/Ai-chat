import fs from "fs";
import os from "os";
import path from "path";
import { FileAgent } from "../agent/fileAgent.js";
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


const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-handler-"));
const agent = new FileAgent(root);

// codex stub: only the "task" path calls run().
let runCalls = 0;
const codex = {
    files: agent,
    run: async task => {
        runCalls += 1;
        return [{ task, result: { success: true } }];
    }
};

agent.execute({
    action: "create",
    file: "sample.txt",
    content: "Hello World"
});

fs.mkdirSync(path.join(root, "sub"), { recursive: true });


async function call(body) {
    return handleCodexRequest(body, codex);
}


// 1. Authorized patch edit applies on disk.
let outcome = await call({
    action: "edit",
    file: "sample.txt",
    oldCode: "Hello",
    newCode: "Hi"
});
assert(
    "edit (patch) -> 200 + applied to disk",
    outcome.status === 200 &&
    outcome.json.success === true &&
    fs.readFileSync(path.join(root, "sample.txt"), "utf8") === "Hi World"
);

// 2. Authorized full overwrite applies on disk.
outcome = await call({
    action: "edit",
    file: "sample.txt",
    content: "Replaced"
});
assert(
    "edit (overwrite) -> 200 + applied to disk",
    outcome.status === 200 &&
    outcome.json.success === true &&
    fs.readFileSync(path.join(root, "sample.txt"), "utf8") === "Replaced"
);

// 3. Missing file -> 404.
outcome = await call({
    action: "edit",
    file: "nope.txt",
    content: "x"
});
assert(
    "edit missing file -> 404 File not found",
    outcome.status === 404 &&
    outcome.json.success === false &&
    outcome.json.error === "File not found"
);

// 4. Traversal -> 403.
outcome = await call({
    action: "edit",
    file: "../evil.txt",
    content: "x"
});
assert(
    "edit traversal -> 403",
    outcome.status === 403 &&
    outcome.json.success === false &&
    !fs.existsSync(path.join(path.dirname(root), "evil.txt"))
);

// 5. Encoded traversal (single and double encoding) -> 403.
outcome = await call({
    action: "create",
    file: "%2e%2e/evil.txt",
    content: "x"
});
assert("encoded traversal '%2e%2e' -> 403", outcome.status === 403);

outcome = await call({
    action: "create",
    file: "%252e%252e/evil.txt",
    content: "x"
});
assert("double-encoded traversal -> 403", outcome.status === 403);

// 6. Absolute path -> 403.
outcome = await call({
    action: "edit",
    file: "/etc/passwd",
    content: "x"
});
assert("absolute path -> 403", outcome.status === 403);

// 7. Backslash traversal and drive paths -> 403.
outcome = await call({
    action: "edit",
    file: "..\\evil\\x.txt",
    content: "x"
});
assert("backslash traversal -> 403", outcome.status === 403);

outcome = await call({
    action: "edit",
    file: "C:\\evil.txt",
    content: "x"
});
assert("drive-letter path -> 403", outcome.status === 403);

// 8. Sensitive runtime paths -> 403.
outcome = await call({
    action: "edit",
    file: "server/server.js",
    content: "x"
});
assert("sensitive 'server/...' -> 403", outcome.status === 403);

outcome = await call({
    action: "edit",
    file: ".env",
    content: "x"
});
assert("sensitive '.env' -> 403", outcome.status === 403);

outcome = await call({
    action: "edit",
    file: "memory/notes.txt",
    content: "x"
});
assert("sensitive 'memory/...' -> 403", outcome.status === 403);

// 9. Unknown action -> 400.
outcome = await call({
    action: "delete",
    file: "sample.txt",
    content: "x"
});
assert(
    "unknown action -> 400",
    outcome.status === 400 &&
    outcome.json.error === "Unknown file action"
);

// 10. Empty body / no task -> 400.
outcome = await call({});
assert(
    "empty body -> 400 Task required",
    outcome.status === 400 &&
    outcome.json.error === "Task required"
);

// 11. Task path still works.
outcome = await call({ task: "create a website" });
assert(
    "task pipeline still returns success",
    outcome.status === 200 &&
    outcome.json.success === true &&
    outcome.json.result &&
    outcome.json.result.length === 1
);

// 12. Task path never reports fake success on a failed step.
const failingRun = async () => {
    return [
        { type: "analysis", result: { success: true } },
        { type: "file", result: { success: false, error: "boom" } }
    ];
};
outcome = await handleCodexRequest(
    { task: "edit the file" },
    { files: agent, run: failingRun }
);
assert(
    "task with failed step -> not fake success",
    outcome.status === 400 &&
    outcome.json.success === false &&
    outcome.json.result &&
    outcome.json.result.length === 2
);

// 13. Write failure (edit a directory) -> structured 500.
outcome = await call({
    action: "edit",
    file: "sub",
    content: "not a file"
});
assert(
    "write failure -> structured 500",
    outcome.status === 500 &&
    outcome.json.success === false &&
    typeof outcome.json.error === "string" &&
    outcome.json.error.length > 0
);

// No "task" route was invoked by the direct file operations above.
assert("file ops did not run the task pipeline", runCalls === 1);

// 14. Non-string action (number) -> 400, not treated as file op.
outcome = await call({
    action: 123,
    file: "sample.txt",
    content: "x"
});
assert(
    "numeric action -> 400 (not file op, falls through to task)",
    outcome.status === 400
);

// 15. Array body with .action and .file -> 400, not treated as file op.
const arr = ["create", "sample.txt"];
arr.action = "create";
arr.file = "sample.txt";
arr.content = "x";
outcome = await call(arr);
assert(
    "array body -> 400 (not file op)",
    outcome.status === 400
);

// 16. Non-string content -> 400.
outcome = await call({
    action: "edit",
    file: "sample.txt",
    content: 123
});
assert(
    "numeric content -> 400",
    outcome.status === 400 &&
    outcome.json.error === "content, oldCode, and newCode must be strings"
);

// 17. Non-string oldCode -> 400.
outcome = await call({
    action: "edit",
    file: "sample.txt",
    oldCode: ["Hello"]
});
assert(
    "array oldCode -> 400",
    outcome.status === 400
);

console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}