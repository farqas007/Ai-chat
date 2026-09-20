import assert from "node:assert";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FileAgent } from "../agent/fileAgent.js";


const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testPatch-"));

const agent = new FileAgent(tmpDir);


try {

    /* Success path: fixture contains the exact expected old text. */

    fs.writeFileSync(
        path.join(tmpDir, "fixture.txt"),
        "Hello World",
        "utf8"
    );


    const result = agent.execute({

        action: "edit",

        file: "fixture.txt",

        oldCode: "Hello",

        newCode: "Hi"

    });


    assert.strictEqual(
        result.success,
        true,
        "patch must succeed when the old text exists"
    );


    const updated = agent.read("fixture.txt");

    assert.ok(
        typeof updated === "string" && updated.includes("Hi"),
        "resulting file must contain the new text"
    );

    assert.ok(
        !updated.includes("Hello"),
        "resulting file must no longer contain the old text"
    );


    /* Failure path: missing old text must be reported and file left untouched. */

    fs.writeFileSync(
        path.join(tmpDir, "keep.txt"),
        "Keep this line",
        "utf8"
    );


    const missing = agent.execute({

        action: "edit",

        file: "keep.txt",

        oldCode: "Nope",

        newCode: "Nada"

    });


    assert.strictEqual(
        missing.success,
        false,
        "patch must fail when the old text is absent"
    );

    assert.strictEqual(
        missing.error,
        "Old code not found",
        "failure must report that the old code was not found"
    );

    assert.strictEqual(
        agent.read("keep.txt"),
        "Keep this line",
        "file must be untouched when the patch fails"
    );


    /* Multi-occurrence: all instances of oldCode must be replaced. */

    fs.writeFileSync(
        path.join(tmpDir, "multi.txt"),
        "aaa bbb aaa ccc aaa",
        "utf8"
    );

    const multi = agent.execute({
        action: "edit",
        file: "multi.txt",
        oldCode: "aaa",
        newCode: "zzz"
    });

    assert.strictEqual(
        multi.success,
        true,
        "patch must succeed with multiple occurrences"
    );

    const multiContent = agent.read("multi.txt");

    assert.strictEqual(
        multiContent,
        "zzz bbb zzz ccc zzz",
        "replaceAll must replace every occurrence"
    );


    console.log("PASS: patch replaces existing old text with new text");
    console.log("PASS: missing old text fails without modifying the file");

}
finally {

    fs.rmSync(tmpDir, { recursive: true, force: true });

}