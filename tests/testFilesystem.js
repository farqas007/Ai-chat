import assert from "node:assert";

import path from "node:path";
import { fileURLToPath } from "node:url";

import { ProjectScanner } from "../filesystem/projectScanner.js";
import { readFile } from "../filesystem/fileManager.js";


const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);


const scanner = new ProjectScanner(repoRoot);

const files = scanner.scan();


assert.ok(
    Array.isArray(files),
    "scan must return an array"
);

assert.ok(
    files.length > 0,
    "scan must find at least one file"
);

assert.ok(
    files.includes("package.json"),
    "repository package.json must be scanned"
);

assert.ok(
    files.includes("tests/testFilesystem.js"),
    "the test file itself must be scanned"
);


const summary = scanner.summarize(files);

assert.strictEqual(
    summary.totalFiles,
    files.length,
    "summary total must match the scanned file count"
);

assert.ok(
    summary.javascript > 0,
    "repository must contain .js files"
);

assert.ok(
    summary.html > 0,
    "repository must contain .html files"
);

assert.ok(
    summary.css > 0,
    "repository must contain .css files"
);


const jsFiles = scanner.findFile(files, ".js");

assert.ok(
    jsFiles.length > 0,
    "findFile must locate .js files"
);

assert.ok(
    jsFiles.every(f => f.includes(".js")),
    "findFile results must contain the search keyword"
);


const project = scanner.detectProject(files);

assert.strictEqual(
    typeof project.hasReact,
    "boolean",
    "detectProject must report booleans"
);


const pkg = await readFile(path.join(repoRoot, "package.json"));

assert.ok(
    pkg.includes("ai-chat"),
    "package.json must contain the project name"
);


/* SEC-04: sensitive paths are blocked by fileManager. */

try {
    await readFile(".env");
    assert.fail("readFile must throw for .env");
} catch (e) {
    assert.ok(
        e.message.includes("Sensitive path"),
        "readFile throws Sensitive path for .env"
    );
}

try {
    await readFile("server/server.js");
    assert.fail("readFile must throw for server/ path");
} catch (e) {
    assert.ok(
        e.message.includes("Sensitive path"),
        "readFile throws Sensitive path for server/ path"
    );
}

try {
    await readFile("keys/ssh.key");
    assert.fail("readFile must throw for sensitive .key file");
} catch (e) {
    assert.ok(
        e.message.includes("Sensitive path"),
        "readFile throws Sensitive path for .key file"
    );
}

try {
    await readFile("memory.json");
    assert.fail("readFile must throw for memory.json");
} catch (e) {
    assert.ok(
        e.message.includes("Sensitive path"),
        "readFile throws Sensitive path for memory.json"
    );
}

const safeRead = await readFile("package.json", repoRoot);
assert.ok(
    typeof safeRead === "string" && safeRead.length > 0,
    "readFile succeeds for allowed project file"
);


console.log("PASS: filesystem scan + read resolve against the repository root");