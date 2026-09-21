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

            // Count occurrences to prevent silent multi-location edits.
            const matchCount = content.split(oldCode).length - 1;

            if (matchCount > 1) {
                return {
                    success: false,
                    message: "Ambiguous: old code matches " + matchCount + " locations. Provide more context to target a single match."
                };
            }

            const idx = content.indexOf(oldCode);

            const updated =
                content.slice(0, idx) +
                newCode +
                content.slice(idx + oldCode.length);

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