import fs from "fs/promises";
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
    const fullPath = resolveInside(root || defaultRoot, file);
    if (!fullPath) {
        throw new Error("Invalid file path");
    }
    return fullPath;
}

export async function readFile(file, root = defaultRoot) {
    return await fs.readFile(
        guardedPath(file, root),
        "utf-8"
    );
}

export async function writeFile(file, content, root = defaultRoot) {
    await fs.writeFile(
        guardedPath(file, root),
        content,
        "utf-8"
    );
    console.log("File updated:", file);
}

export async function createFile(file, content = "", root = defaultRoot) {
    await fs.writeFile(
        guardedPath(file, root),
        content
    );
    console.log("File created:", file);
}

export async function deleteFile(file, root = defaultRoot) {
    await fs.unlink(
        guardedPath(file, root)
    );
    console.log("File deleted:", file);
}