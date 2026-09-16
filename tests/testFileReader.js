import assert from "node:assert";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FileReader } from "../agent/fileReader.js";


const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testFileReader-"));

const sample = path.join(tmpDir, "sample.js");

const expected = "line1\nline2\n";


try {

    fs.writeFileSync(sample, expected, "utf8");


    const reader = new FileReader();

    const result = reader.read(sample);

    assert.strictEqual(
        result.success,
        true,
        "reading an existing file must succeed"
    );

    assert.strictEqual(
        result.path,
        sample,
        "result must report the requested path"
    );

    assert.strictEqual(
        result.content,
        expected,
        "result must carry the exact file content"
    );

    assert.strictEqual(
        result.lines,
        3,
        "line count must account for the trailing newline"
    );

    assert.strictEqual(
        result.extension,
        "js",
        "extension must be derived from the file name"
    );

    assert.strictEqual(
        result.size,
        Buffer.byteLength(expected, "utf8"),
        "size must match the byte length of the content"
    );


    /* Missing files must be reported as failures, not throw. */

    const missingResult = reader.read(path.join(tmpDir, "missing.txt"));

    assert.strictEqual(
        missingResult.success,
        false,
        "reading a missing file must report failure"
    );

    assert.ok(
        typeof missingResult.error === "string" && missingResult.error.length > 0,
        "failure result must carry an error message"
    );


    /* readMany must map every path. */

    const many = reader.readMany([sample, path.join(tmpDir, "missing.txt")]);

    assert.strictEqual(many.length, 2, "readMany must return one result per path");

    assert.strictEqual(many[0].success, true, "existing path must succeed");

    assert.strictEqual(many[1].success, false, "missing path must fail");


    console.log("PASS: file reader returns exact content and honest success flags");

}
finally {

    fs.rmSync(tmpDir, { recursive: true, force: true });

}