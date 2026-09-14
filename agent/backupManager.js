import fs from "fs";
import path from "path";

export class BackupManager {

    constructor(directory = "./backups") {

        this.directory = directory;

        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

    }

    backup(file) {

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

        fs.copyFileSync(
            backupFile,
            targetFile
        );

    }

}