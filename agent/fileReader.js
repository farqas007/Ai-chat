import fs from "fs";
import path from "path";

export class FileReader {

    constructor(root) {
        this.root = root ? path.resolve(root) : null;
    }

    read(filePath) {

        try {

            let target = filePath;

            // When a root is configured, resolve against it and reject
            // paths that escape the root (including symlink traversal).
            if (this.root) {

                const resolved = path.resolve(this.root, filePath);

                let canonicalRoot;

                try {
                    canonicalRoot = fs.realpathSync(this.root);
                } catch {
                    canonicalRoot = this.root;
                }

                let canonicalPath;

                try {
                    canonicalPath = fs.realpathSync(resolved);
                } catch {
                    canonicalPath = resolved;
                }

                const relative = path.relative(canonicalRoot, canonicalPath);

                if (
                    relative === "" ||
                    relative.startsWith("..") ||
                    path.isAbsolute(relative)
                ) {
                    return {
                        success: false,
                        path: filePath,
                        error: "Access denied"
                    };
                }

                target = resolved;
            }

            const content = fs.readFileSync(target, "utf8");

            const stats = fs.statSync(target);

            return {

                success: true,

                path: filePath,

                content,

                size: stats.size,

                lines: content.split("\n").length,

                extension: target.split(".").pop()

            };

        } catch (error) {

            return {

                success: false,

                path: filePath,

                error: error.message

            };

        }

    }

    readMany(files = []) {

        return files.map(file => this.read(file));

    }

}
