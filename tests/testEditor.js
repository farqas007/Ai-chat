import assert from "node:assert";

import fs from "node:fs";

import os from "node:os";

import path from "node:path";

import {
    readFile,
    writeFile,
    replaceCode
} from "../editor/codeEditor.js";


const root = fs.mkdtempSync(path.join(os.tmpdir(), "codeEditor-"));

const testFile = path.join(root, "notes.txt");


try {

    /* BUG-16: readFile returns null (never a literal) for a missing file. */

    assert.strictEqual(
        readFile(path.join(root, "missing.txt"), root),
        null,
        "readFile returns null for a missing file"
    );


    /* Round-trip inside the root. */

    writeFile(testFile, "Hello<br>World<br>", root);

    assert.strictEqual(
        readFile(testFile, root),
        "Hello<br>World<br>",
        "writeFile + readFile round-trip"
    );


    /* replaceCode replaces in place. */

    assert.strictEqual(
        replaceCode(testFile, "World", "AI Chat", root),
        "Code replaced",
        "replaceCode reports a successful replacement"
    );

    const updated = readFile(testFile, root);

    assert.ok(
        updated.includes("AI Chat"),
        "replaceCode updated the file"
    );


    /* replaceCode on a missing file is reported, not leaked (BUG-16). */

    assert.strictEqual(
        replaceCode(path.join(root, "nope.txt"), "a", "b", root),
        "File not found",
        "replaceCode reports a missing file without exposing contents"
    );


    /* SEC-03: writes and reads outside the root are refused. */

    assert.throws(
        () => writeFile("../escape.txt", "x", root),
        /Invalid file path/,
        "writeFile rejects traversal outside the root"
    );

    assert.throws(
        () => writeFile("/etc/code-editor-test.txt", "x", root),
        /Invalid file path/,
        "writeFile rejects an absolute path outside the root"
    );

    assert.strictEqual(
        readFile("../escape.txt", root),
        null,
        "readFile returns null for traversal outside the root"
    );


    /* SEC-04: sensitive paths are blocked by codeEditor. */

    assert.strictEqual(
        readFile(".env", root),
        null,
        "readFile returns null for .env"
    );

    assert.throws(
        () => writeFile(".env", "SECRET=x", root),
        /Invalid file path/,
        "writeFile rejects .env"
    );

    assert.strictEqual(
        readFile("server/server.js", root),
        null,
        "readFile returns null for server/ path"
    );

    assert.throws(
        () => writeFile("keys/ssh.key", "x", root),
        /Invalid file path/,
        "writeFile rejects sensitive .key file"
    );

    assert.strictEqual(
        replaceCode(".env", "old", "new", root),
        "File not found",
        "replaceCode returns File not found for .env"
    );


    console.log("PASS: codeEditor containment + missing-file semantics");

}
finally {

    fs.rmSync(root, { recursive: true, force: true });

}