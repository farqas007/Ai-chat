import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveInside } from "../server/pathGuard.js";

export class BackupManager {

    constructor(directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "backups"), options = {}) {
        this.directory = directory;

        this.workspaceRoot = options.workspaceRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }
    }

    // A source file is only backed up when it lives inside the configured
    // workspace root. Restores only accept backups from inside this
    // backup directory and targets inside the workspace root.
    _inside(root, file) {
        return (
            typeof root === "string" &&
            typeof file === "string" &&
            resolveInside(root, file) !== null
        );
    }

    backup(file) {
        if (!this._inside(this.workspaceRoot, file)) {
            return null;
        }

        if (!fs.existsSync(file)) {
            return null;
        }

        const name =
            path.basename(file) +
            "." +
            Date.now() +
            ".bak";

        const destination =
            path.join(this.directory, name);

        fs.copyFileSync(file, destination);

        return destination;
    }

    restore(backupFile, targetFile) {
        if (!this._inside(this.directory, backupFile)) {
            throw new Error("Invalid backup file");
        }

        if (!this._inside(this.workspaceRoot, targetFile)) {
            throw new Error("Invalid target file");
        }

        fs.copyFileSync(
            backupFile,
            targetFile
        );
    }

}