import fs from "fs";
import path from "path";

const DEFAULT_MAX_DEPTH = 20;

export class WorkspaceScanner {

    scan(root = ".", maxDepth) {

        const result = [];

        const depth = typeof maxDepth === "number"
            ? maxDepth
            : DEFAULT_MAX_DEPTH;

        this.walk(root, result, 0, depth);

        return result;

    }

    walk(dir, result, currentDepth, maxDepth) {

        if (currentDepth > maxDepth) {

            return;

        }

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

                this.walk(full, result, currentDepth + 1, maxDepth);

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