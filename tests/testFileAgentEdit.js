import fs from "fs";
import os from "os";
import path from "path";
import { FileAgent } from "../agent/fileAgent.js";


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


const root = fs.mkdtempSync(path.join(os.tmpdir(), "fileagent-edit-"));
const agent = new FileAgent(root);
const outside = path.join(path.dirname(root), "aichat-fileagent-outside.txt");

const outsideNames = [outside];
function assertNotOutside() {
    outsideNames.forEach(file => {
        assert("no file written outside sandbox", !fs.existsSync(file));
    });
}


// 1. create a file inside the sandbox.
let result = agent.execute({
    action: "create",
    file: "notes.txt",
    content: "Hello World"
});
assert(
    "create succeeds",
    result.success === true &&
    fs.readFileSync(path.join(root, "notes.txt"), "utf8") === "Hello World"
);

// 2. patch edit: oldCode -> newCode.
result = agent.execute({
    action: "edit",
    file: "notes.txt",
    oldCode: "Hello",
    newCode: "Hi"
});
assert(
    "edit (patch replace) succeeds",
    result.success === true &&
    result.file === path.join(root, "notes.txt") &&
    fs.readFileSync(path.join(root, "notes.txt"), "utf8") === "Hi World"
);

// 3. edit overwrite with new content.
result = agent.execute({
    action: "edit",
    file: "notes.txt",
    content: "Replaced entirely"
});
assert(
    "edit (full overwrite) succeeds",
    result.success === true &&
    fs.readFileSync(path.join(root, "notes.txt"), "utf8") === "Replaced entirely"
);

// 4. edit a missing file -> structured failure.
result = agent.execute({
    action: "edit",
    file: "missing.txt",
    content: "x"
});
assert(
    "edit missing file -> 'File not found'",
    result.success === false &&
    result.error === "File not found"
);

// 5. edit with no content -> structured failure.
fs.writeFileSync(path.join(root, "empty-target.txt"), "target");
result = agent.execute({
    action: "edit",
    file: "empty-target.txt"
});
assert(
    "edit without content -> 'No edit content provided'",
    result.success === false &&
    result.error === "No edit content provided"
);

// 6. oldCode that does not exist -> surfaced failure.
result = agent.execute({
    action: "edit",
    file: "notes.txt",
    oldCode: "does not exist anywhere",
    newCode: "nope"
});
assert(
    "edit with unmatched oldCode -> failure surfaced",
    result.success === false &&
    (result.error || result.message) === "Old code not found"
);

// 7. traversal edit -> rejected, nothing written outside.
result = agent.execute({
    action: "edit",
    file: "../aichat-fileagent-outside.txt",
    content: "evil"
});
assert(
    "edit with '../' rejected",
    result.success === false &&
    result.error === "Invalid file path"
);

// 8. absolute path edit -> rejected.
result = agent.execute({
    action: "edit",
    file: "/etc/passwd",
    content: "evil"
});
assert(
    "edit with absolute path rejected",
    result.success === false &&
    result.error === "Invalid file path"
);

// 9. encoded traversal (..%2f..%2f) is rejected outright, never escapes.
result = agent.execute({
    action: "create",
    file: "..%2f..%2f.aichat-fileagent-escaped.txt",
    content: "escaped"
});
assert(
    "encoded traversal rejected before writing",
    result.success === false &&
    result.error === "Invalid file path"
);

// 10. edit failure (writing to a directory) must return a structured error, not throw.
fs.mkdirSync(path.join(root, "subdir"), { recursive: true });
let threw = false;
let writeResult;
try {
    writeResult = agent.execute({
        action: "edit",
        file: "subdir",
        content: "not a file"
    });
} catch (error) {
    threw = true;
}
assert(
    "edit write failure returned as structured error",
    threw === false &&
    writeResult &&
    writeResult.success === false &&
    typeof writeResult.error === "string" &&
    writeResult.error.length > 0
);

// 11. unknown action still rejected.
result = agent.execute({
    action: "delete",
    file: "notes.txt"
});
assert(
    "unknown action still rejected",
    result.success === false &&
    result.error === "Unknown file action"
);

assertNotOutside();

console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}