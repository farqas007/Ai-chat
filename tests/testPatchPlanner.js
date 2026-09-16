import assert from "node:assert";

import { PatchPlanner } from "../agent/patchPlanner.js";


const planner = new PatchPlanner();

const task = "Add dark mode";


/* With relevant files, a modify operation is planned per file. */

const files = ["js/app.js", "js/chat.js", "css/style.css"];

const withFiles = planner.plan(task, { relevantFiles: files });

assert.strictEqual(
    withFiles.length,
    files.length,
    "one operation must be planned per relevant file"
);

for (let i = 0; i < files.length; i++) {

    assert.strictEqual(withFiles[i].action, "modify", "each op must be a modify");

    assert.strictEqual(withFiles[i].file, files[i], "each op must target its file");

    assert.strictEqual(withFiles[i].backup, true, "modify ops must be backed up");

    assert.strictEqual(withFiles[i].priority, 1, "all ops start at priority 1");

    assert.strictEqual(withFiles[i].reason, task, "each op must carry the task as reason");

}


/* Without relevant files, a single create for index.html is planned. */

const empty = planner.plan(task, {});

assert.strictEqual(empty.length, 1, "empty context must plan exactly one op");

assert.strictEqual(empty[0].action, "create", "fallback op must be a create");

assert.strictEqual(empty[0].file, "index.html", "fallback op must target index.html");

assert.strictEqual(empty[0].backup, false, "create ops must not require a backup");


console.log("PASS: patch planner produces the expected operation structure");