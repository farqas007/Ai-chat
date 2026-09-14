import fs from "fs";
import { BackupManager } from "../agent/backupManager.js";

const manager = new BackupManager();

fs.writeFileSync(
    "backup-test.txt",
    "Hello World"
);

const backup = manager.backup(
    "backup-test.txt"
);

console.log("Backup:", backup);

fs.writeFileSync(
    "backup-test.txt",
    "Modified"
);

manager.restore(
    backup,
    "backup-test.txt"
);

console.log(
    fs.readFileSync(
        "backup-test.txt",
        "utf8"
    )
);
