import assert from "node:assert";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ProjectIndexer } from "../agent/projectIndexer.js";


const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testProjectIndexer-"));


try {

    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });

    fs.mkdirSync(path.join(tmpDir, "styles"), { recursive: true });

    fs.writeFileSync(path.join(tmpDir, "src", "app.js"), "// app", "utf8");

    fs.writeFileSync(path.join(tmpDir, "src", "main.js"), "// main", "utf8");

    fs.writeFileSync(path.join(tmpDir, "styles", "app.css"), "// css", "utf8");

    fs.writeFileSync(path.join(tmpDir, "index.html"), "<html></html>", "utf8");

    fs.writeFileSync(path.join(tmpDir, "data.json"), "{}", "utf8");

    fs.writeFileSync(path.join(tmpDir, "README.md"), "readme", "utf8");


    const result = new ProjectIndexer(tmpDir).index();

    assert.strictEqual(result.totalFiles, 6, "all six fixture files must be counted");

    assert.strictEqual(result.totalFolders, 2, "both fixture folders must be counted");

    assert.strictEqual(result.js.length, 2, "both .js files must be indexed");

    assert.strictEqual(result.css.length, 1, "the .css file must be indexed");

    assert.strictEqual(result.html.length, 1, "the .html file must be indexed");

    assert.strictEqual(result.json.length, 1, "the .json file must be indexed");

    assert.strictEqual(result.other.length, 1, "README.md must land in other");

    assert.strictEqual(result.folders.length, 2, "both folders must be listed");

    assert.ok(
        result.js.includes(path.join(tmpDir, "src", "app.js")),
        "js index must contain the resolved app.js path"
    );

    assert.strictEqual(
        result.js.reduce((sum, p) => sum + p.startsWith(tmpDir), 0),
        result.js.length,
        "all indexed paths must stay inside the fixture root"
    );


    console.log("PASS: project indexer counts and categorizes a controlled project");

}
finally {

    fs.rmSync(tmpDir, { recursive: true, force: true });

}