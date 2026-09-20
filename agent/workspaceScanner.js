import fs from "fs";
import path from "path";

export class WorkspaceScanner {

    scan(root = ".") {

        const result = [];

        this.walk(root, result);

        return result;

    }

    walk(dir, result) {

        let items;

        try {

            items = fs.readdirSync(dir);

        } catch {

            return;

        }

        for (const item of items) {

            const full = path.join(dir, item);

            let stat;

            try {

                stat = fs.lstatSync(full);

            } catch {

                continue;

            }

            if (stat.isSymbolicLink()) {

                continue;

            }

            if (stat.isDirectory()) {

                if (
                    item === "node_modules" ||
                    item === ".git"
                ) {
                    continue;
                }

                result.push({
                    type: "folder",
                    path: full
                });

                this.walk(full, result);

            } else {

                result.push({
                    type: "file",
                    path: full,
                    size: stat.size
                });

            }

        }

    }

}