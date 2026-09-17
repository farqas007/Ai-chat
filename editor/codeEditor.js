import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveInside } from "../server/pathGuard.js";

const defaultRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);

// All file operations stay inside a configured root (default: the project
// root). Paths that resolve outside the root are rejected instead of being
// written or read blindly.
function guardedPath(file, root) {
    return resolveInside(root || defaultRoot, file);
}

export function readFile(file, root = defaultRoot) {
    const fullPath = guardedPath(file, root);

    if (!fullPath || !fs.existsSync(fullPath)) {
        return null;
    }

    return fs.readFileSync(
        fullPath,
        "utf-8"
    );
}

export function writeFile(file, content, root = defaultRoot) {
    const fullPath = guardedPath(file, root);

    if (!fullPath) {
        throw new Error("Invalid file path");
    }

    fs.writeFileSync(
        fullPath,
        content,
        "utf-8"
    );

    return "File updated successfully";
}

export function replaceCode(file, oldCode, newCode, root = defaultRoot) {
    const content = readFile(file, root);

    if (content === null) {
        return "File not found";
    }

    if (content.includes(oldCode)) {
        writeFile(
            file,
            content.replace(oldCode, newCode),
            root
        );

        return "Code replaced";
    }

    return "Old code not found";
}