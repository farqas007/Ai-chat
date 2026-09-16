import assert from "node:assert";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DependencyAnalyzer } from "../agent/dependencyAnalyzer.js";


const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testDependency-"));

const aPath = path.join(tmpDir, "a.js");

const bPath = path.join(tmpDir, "b.js");

const missing = path.join(tmpDir, "does-not-exist.js");


try {

    fs.writeFileSync(
        aPath,
        'import fs from "node:fs";\nimport b from "./b.js";\n',
        "utf8"
    );

    fs.writeFileSync(
        bPath,
        "export const x = 1;\n",
        "utf8"
    );


    const graph = new DependencyAnalyzer().analyze([aPath, bPath, missing]);


    assert.deepStrictEqual(
        graph[aPath],
        ["node:fs", "./b.js"],
        "imports must be extracted in order with exact specifiers"
    );

    assert.deepStrictEqual(
        graph[bPath],
        [],
        "a file with no imports must have an empty graph entry"
    );

    assert.deepStrictEqual(
        graph[missing],
        [],
        "an unreadable file must not crash analysis and yield an empty entry"
    );


    console.log("PASS: dependency analyzer extracts exact import graph");

}
finally {

    fs.rmSync(tmpDir, { recursive: true, force: true });

}