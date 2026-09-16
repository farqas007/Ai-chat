import assert from "node:assert";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MemoryManager } from "../core/memoryManager.js";
import { SessionManager } from "../core/sessionManager.js";
import { BackupManager } from "../agent/backupManager.js";
import { FileAgent } from "../agent/fileAgent.js";
import { ProjectIndexer } from "../agent/projectIndexer.js";
import { ProjectScanner } from "../filesystem/projectScanner.js";


const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);

const originalCwd = process.cwd();

const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "testRuntimePaths-"));

const memoryJson = path.join(repoRoot, "memory.json");

const backupsDir = path.join(repoRoot, "backups");

const sessionsDir = path.join(repoRoot, "sessions");

const snap = {

    memoryJson: fs.existsSync(memoryJson)
        ? fs.readFileSync(memoryJson, "utf8")
        : null,

    backupsExisted: fs.existsSync(backupsDir),

    sessionsExisted: fs.existsSync(sessionsDir)

};


try {

    process.chdir(tmpCwd);


    const memory = new MemoryManager();

    assert.strictEqual(
        memory.file,
        path.join(repoRoot, "memory.json"),
        "memory file must anchor to the repo root, not the CWD"
    );

    const backups = new BackupManager();

    assert.strictEqual(
        backups.directory,
        path.join(repoRoot, "backups"),
        "backup directory must anchor to the repo root, not the CWD"
    );

    const sessions = new SessionManager();

    assert.strictEqual(
        sessions.directory,
        path.join(repoRoot, "sessions"),
        "session directory must anchor to the repo root, not the CWD"
    );

    const files = new FileAgent();

    assert.strictEqual(
        files.root,
        repoRoot,
        "file agent sandbox must anchor to the repo root, not the CWD"
    );

    const indexer = new ProjectIndexer();

    assert.strictEqual(
        indexer.root,
        repoRoot,
        "project indexer must anchor to the repo root, not the CWD"
    );

    const scanner = new ProjectScanner();

    assert.strictEqual(
        scanner.root,
        repoRoot,
        "project scanner must anchor to the repo root, not the CWD"
    );


    assert.ok(
        !memory.file.startsWith(tmpCwd) &&
        !backups.directory.startsWith(tmpCwd) &&
        !sessions.directory.startsWith(tmpCwd),
        "no runtime default may resolve inside the working directory"
    );


    console.log("PASS: runtime defaults resolve to repo-root paths independent of CWD");

}
finally {

    process.chdir(originalCwd);

    fs.rmSync(tmpCwd, { recursive: true, force: true });

    try {

        if (snap.memoryJson === null) {

            fs.rmSync(memoryJson, { force: true });

        } else {

            fs.writeFileSync(memoryJson, snap.memoryJson, "utf8");

        }

    } catch {}

    if (!snap.backupsExisted) {

        fs.rmSync(backupsDir, { recursive: true, force: true });

    }

    if (!snap.sessionsExisted) {

        fs.rmSync(sessionsDir, { recursive: true, force: true });

    }

}