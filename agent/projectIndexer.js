import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export class ProjectIndexer {

    constructor(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
        this.root = root;
    }

    index() {

        const result = {
            totalFiles: 0,
            totalFolders: 0,

            js: [],
            css: [],
            html: [],
            json: [],
            other: [],

            folders: []
        };

        this.scan(this.root, result);

        return result;
    }

    scan(dir, result) {

        let items;

        try {
            items = fs.readdirSync(dir);
        } catch {
            return;
        }

        for (const item of items) {

            // Ignore folders
            if (
                item === "node_modules" ||
                item === ".git"
            ) {
                continue;
            }

            const fullPath = path.join(dir, item);

            let stat;

            try {
                stat = fs.lstatSync(fullPath);
            } catch {
                continue;
            }

            // Skip symlinks so a link can never cause infinite recursion,
            // escape the project root, or surface an unreadable target.
            if (stat.isSymbolicLink()) {
                continue;
            }

            if (stat.isDirectory()) {

                result.totalFolders++;

                result.folders.push(fullPath);

                this.scan(fullPath, result);

            } else {

                result.totalFiles++;

                const ext = path.extname(item);

                switch (ext) {

                    case ".js":
                        result.js.push(fullPath);
                        break;

                    case ".css":
                        result.css.push(fullPath);
                        break;

                    case ".html":
                        result.html.push(fullPath);
                        break;

                    case ".json":
                        result.json.push(fullPath);
                        break;

                    default:
                        result.other.push(fullPath);

                }

            }

        }

    }

}
