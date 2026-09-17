import assert from "node:assert";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BackupManager } from "../agent/backupManager.js";


const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "testBackup-"));

const workDir = path.join(tmpBase, "work");

fs.mkdirSync(workDir, { recursive: true });

const backupDir = path.join(tmpBase, "backups");

const file = path.join(workDir, "hello.txt");

const original = "Hello World";

fs.writeFileSync(file, original, "utf8");


try {

    const manager = new BackupManager(backupDir, {
    workspaceRoot: workDir
});

    const backupPath = manager.backup(file);

    assert.ok(
        backupPath,
        "backup must return a destination path"
    );

    assert.ok(
        fs.existsSync(backupPath),
        "backup file must exist"
    );

    assert.strictEqual(
        fs.readFileSync(backupPath, "utf8"),
        original,
        "backup file must contain the original content"
    );


    fs.writeFileSync(file, "Modified", "utf8");

    assert.strictEqual(
        fs.readFileSync(file, "utf8"),
        "Modified",
        "original must be modified before restore"
    );


    manager.restore(backupPath, file);

    assert.strictEqual(
        fs.readFileSync(file, "utf8"),
        original,
        "restore must bring back the backed-up content"
    );


    assert.ok(
        backupPath.startsWith(backupDir),
        "backup must live inside the configured backup directory"
    );


    /* SEC-03: containment. */

    assert.strictEqual(
        manager.backup(path.join(tmpBase, "outside.txt")),
        null,
        "files outside the workspace root are not backed up"
    );

    assert.throws(
        () => manager.restore(backupPath, path.join(tmpBase, "victim.txt")),
        /Invalid target file/,
        "restore refuses targets outside the workspace root"
    );

    assert.throws(
        () => manager.restore(path.join(workDir, "not-a-backup.txt"), file),
        /Invalid backup file/,
        "restore refuses backup files outside the backup directory"
    );


    console.log("PASS: backup copies file content; restore recovers the original");

}
finally {

    fs.rmSync(tmpBase, { recursive: true, force: true });

}