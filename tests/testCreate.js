import assert from "node:assert";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FileAgent } from "../agent/fileAgent.js";


const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testCreate-"));

const agent = new FileAgent(tmpDir);


try {

    const result = agent.execute({

        action: "create",

        file: "hello-ai.txt",

        content: "AI Agent created this file"

    });


    assert.strictEqual(
        result.success,
        true,
        "create must succeed"
    );

    const expectedPath = path.join(tmpDir, "hello-ai.txt");

    assert.strictEqual(
        result.file,
        expectedPath,
        "create must resolve the file inside the sandbox root"
    );

    assert.ok(
        fs.existsSync(expectedPath),
        "created file must exist on disk"
    );

    assert.strictEqual(
        fs.readFileSync(expectedPath, "utf8"),
        "AI Agent created this file",
        "created file must contain the exact content"
    );


    /* Nested directories must be created too. */

    const nested = agent.execute({

        action: "create",

        file: "docs/readme.txt",

        content: "nested"

    });

    assert.strictEqual(nested.success, true, "nested create must succeed");

    assert.ok(
        fs.existsSync(path.join(tmpDir, "docs", "readme.txt")),
        "nested file must exist"
    );


    console.log("PASS: create writes expected content inside the sandbox root");

}
finally {

    fs.rmSync(tmpDir, { recursive: true, force: true });

}