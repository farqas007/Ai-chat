import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveInside } from "../server/pathGuard.js";

export class PatchEngine {

    constructor(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
        this.root = root;
    }

    // Only replaces inside the configured root. Rejects paths that would
    // escape the sandbox before any read or write happens.
    replace(filePath, oldCode, newCode) {
        const fullPath = resolveInside(
            this.root,
            filePath
        );

        if (!fullPath) {
            return {
                success: false,
                error: "Invalid file path"
            };
        }

        try {
            const content = fs.readFileSync(
                fullPath,
                "utf8"
            );

            if (!content.includes(oldCode)) {
                return {
                    success: false,
                    message: "Old code not found"
                };
            }

            const updated = content.replaceAll(
                oldCode,
                newCode
            );

            fs.writeFileSync(
                fullPath,
                updated,
                "utf8"
            );

            return {
                success: true,
                file: fullPath,
                message: "Code replaced successfully"
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}