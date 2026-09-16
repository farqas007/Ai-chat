/* ===========================================================
   Test: ToolManager honesty.

   ToolManager.execute() is intentionally NOT implemented as a
   real tool runner. It must never report success for work it did
   not do. This test guards that contract.
   =========================================================== */


import assert from "node:assert";

import { ToolManager } from "../agent/toolManager.js";


const tool = new ToolManager();


/* 1. An unimplemented tool must NOT report success. */

const result = tool.execute({ type: "exec", name: "shell" });

assert.strictEqual(result.success, false, "unimplemented tool must not succeed");


/* 2. It must carry a clear error message. */

assert.ok(
    (result.error || "").length > 0,
    "result must include a non-empty error message"
);

assert.strictEqual(
    typeof result.error,
    "string",
    "error must be a string"
);


/* 3. The original tool payload is still returned for context. */

assert.strictEqual(result.tool.name, "shell", "tool payload is preserved");


console.log("ToolManager: all tests passed.");