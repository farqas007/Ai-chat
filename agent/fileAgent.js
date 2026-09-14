import fs from "fs";
import path from "path";
import { PatchEngine } from "./patchEngine.js";

export class FileAgent {

    constructor(root = ".") {

        this.root = root;

        this.patch = new PatchEngine();

        if (!fs.existsSync(this.root)) {

            fs.mkdirSync(
                this.root,
                {
                    recursive: true
                }
            );

        }

    }


    // Resolves a user-supplied path inside this.root, or returns null when
    // the path escapes the sandbox (absolute paths, "..", NUL bytes, etc).
    resolveInside(file) {

        if (
            typeof file !== "string" ||
            file.length === 0 ||
            file.includes("\0")
        ) {

            return null;

        }

        try {

            const fullPath =
                path.resolve(
                    this.root,
                    file
                );

            const relative =
                path.relative(
                    path.resolve(this.root),
                    fullPath
                );

            if (
                relative === "" ||
                relative.startsWith("..") ||
                path.isAbsolute(relative)
            ) {

                return null;

            }

            return fullPath;

        }

        catch {

            return null;

        }

    }


    execute(action) {

        console.log(
            "File operation:",
            action
        );


        if (action.action === "create") {

            const filePath =
                this.resolveInside(action.file);

            if (!filePath) {

                return {

                    success: false,

                    error: "Invalid file path"

                };

            }


            const folder =
                path.dirname(filePath);


            if (!fs.existsSync(folder)) {

                fs.mkdirSync(
                    folder,
                    {
                        recursive: true
                    }
                );

            }


            fs.writeFileSync(
                filePath,
                action.content || "",
                "utf8"
            );


            console.log(
                "Created:",
                filePath
            );


            return {

                success: true,

                file: filePath,

                message: "File created"

            };

        }


        return {

            success: false,

            error: "Unknown file action"

        };

    }


    read(file) {

        const fullPath =
            this.resolveInside(file);

        if (!fullPath) {

            return null;

        }


        console.log(
            "Reading file:",
            fullPath
        );


        try {

            const content =
                fs.readFileSync(
                    fullPath,
                    "utf8"
                );

            return content;

        }

        catch {

            return null;

        }

    }


    analyze(filePath) {

        const content =
            this.read(filePath);


        if (content === undefined || content === null) {

            return null;

        }


        const lines =
            content.split("\n").length;


        const size =
            Buffer.byteLength(
                content,
                "utf8"
            );


        const language =
            this.detectLanguage(filePath);


        const imports =
            this.detectImports(content);


        const exports =
            this.detectExports(content);


        const classes =
            this.detectClasses(content);


        const functions =
            this.detectFunctions(content);


        return {

            file: filePath,

            language,

            size,

            lines,

            imports,

            exports,

            classes,

            functions,

            totalImports:
                imports.length,

            totalExports:
                exports.length,

            totalClasses:
                classes.length,

            totalFunctions:
                functions.length

        };

    }


    detectLanguage(filePath) {

        const extension =
            path.extname(filePath)
                .toLowerCase();


        const languages = {

            ".js": "javascript",
            ".mjs": "javascript",
            ".cjs": "javascript",

            ".ts": "typescript",
            ".tsx": "typescript",

            ".jsx": "javascript",

            ".json": "json",

            ".html": "html",

            ".css": "css",

            ".scss": "scss",

            ".md": "markdown",

            ".py": "python",

            ".java": "java",

            ".cpp": "cpp",

            ".c": "c",

            ".php": "php"

        };


        return languages[extension] || "text";

    }


    detectImports(content) {

        const imports = [];


        const importRegex =
            /^\s*import\s+(?:[\s\S]*?)\s+from\s+["']([^"']+)["']\s*;?/gm;


        let match;


        while (
            (match = importRegex.exec(content))
            !== null
        ) {

            imports.push(match[0].trim());

        }


        const sideEffectRegex =
            /^\s*import\s+["']([^"']+)["']\s*;?/gm;


        while (
            (match = sideEffectRegex.exec(content))
            !== null
        ) {

            if (!imports.includes(match[0].trim())) {

                imports.push(match[0].trim());

            }

        }


        return imports;

    }


    detectExports(content) {

        const exports = [];


        const exportRegex =
            /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;


        let match;


        while (
            (match = exportRegex.exec(content))
            !== null
        ) {

            exports.push(match[0].trim());

        }


        if (
            /\bexport\s+default\b/.test(content)
        ) {

            if (
                !exports.some(
                    item => item.includes("export default")
                )
            ) {

                exports.push("export default");

            }

        }


        return exports;

    }


    detectClasses(content) {

        const classes = [];


        const classRegex =
            /\bclass\s+([A-Za-z_$][\w$]*)/g;


        let match;


        while (
            (match = classRegex.exec(content))
            !== null
        ) {

            classes.push(
                match[1]
            );

        }


        return classes;

    }


    detectFunctions(content) {

    const functions = [];

    // Regular function declarations
    const functionRegex =
        /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;

    let match;

    while (
        (match = functionRegex.exec(content)) !== null
    ) {

        functions.push(match[1]);

    }


    // Class/object methods
    const methodRegex =
        /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm;

    const ignored = new Set([
        "if",
        "else",
        "for",
        "while",
        "switch",
        "catch",
        "with"
    ]);

    while (
        (match = methodRegex.exec(content)) !== null
    ) {

        const name = match[1];

        if (
            !ignored.has(name) &&
            !functions.includes(name)
        ) {

            functions.push(name);

        }

    }


    // Arrow functions
    const arrowRegex =
        /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;

    while (
        (match = arrowRegex.exec(content)) !== null
    ) {

        const name = match[1];

        if (
            !functions.includes(name)
        ) {

            functions.push(name);

        }

    }


    return functions;

}


}
