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


/* Without relevant files nothing can be safely patched, so an empty
   plan is returned: the planner must never invent a phantom `create
   index.html` (BUG-18) that could overwrite an existing file. */

const empty = planner.plan(task, {});

assert.strictEqual(
    Array.isArray(empty),
    true,
    "empty context yields an array"
);

assert.strictEqual(
    empty.length,
    0,
    "empty context must plan zero operations (no phantom create)"
);


console.log("PASS: patch planner produces the expected operation structure");