import assert from "node:assert";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    saveProjectMemory,
    loadProjectMemory
} from "../memory/projectMemory.js";


const originalCwd = process.cwd();

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testMemory-"));


try {

    process.chdir(tmpDir);

    fs.mkdirSync("memory", { recursive: true });


    /* Empty memory file must load as an empty object. */

    const empty = loadProjectMemory();

    assert.deepStrictEqual(
        empty,
        {},
        "no memory file must load as {}"
    );


    /* Round-trip: saved data must come back identical. */

    const data = {

        project: "test-memory-isolation",

        features: ["voice", "memory", "code editor"],

        language: "Urdu"

    };

    const rootMemoryPath = path.join(originalCwd, "memory.json");

    const rootMemoryBefore = fs.existsSync(rootMemoryPath)
        ? fs.readFileSync(rootMemoryPath, "utf8")
        : null;


    saveProjectMemory(data);

    const loaded = loadProjectMemory();

    assert.deepStrictEqual(
        loaded,
        data,
        "saved memory must read back identical"
    );

    assert.ok(
        fs.existsSync(
            path.join(tmpDir, "memory", "project-memory.json")
        ),
        "memory must be written inside the isolated temporary location"
    );

    const rootMemoryAfter = fs.existsSync(rootMemoryPath)
        ? fs.readFileSync(rootMemoryPath, "utf8")
        : null;

    assert.strictEqual(
        rootMemoryAfter,
        rootMemoryBefore,
        "repository-root memory.json must not be created or altered"
    );


    console.log("PASS: project memory stores and loads expected data in isolation");

}
finally {

    process.chdir(originalCwd);

    fs.rmSync(tmpDir, { recursive: true, force: true });

}