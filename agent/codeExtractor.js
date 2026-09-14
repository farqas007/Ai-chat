export class CodeExtractor {

    extract(code = "") {

        return {

            imports: this.findImports(code),

            exports: this.findExports(code),

            classes: this.findClasses(code),

            functions: this.findFunctions(code),

            methods: this.findMethods(code),

            todos: this.findTodos(code),

            comments: this.findComments(code)

        };

    }

    findImports(code) {

        const matches = code.match(
            /import\s+.*?from\s+["'](.*?)["']/g
        ) || [];

        return matches.map(line => {

            const m = line.match(
                /["'](.*?)["']/
            );

            return m ? m[1] : line;

        });

    }

    findExports(code) {

        const matches = code.match(
            /export\s+(class|function|const|let|var)\s+([A-Za-z0-9_]+)/g
        ) || [];

        return matches.map(line => {

            const parts = line.split(/\s+/);

            return parts[2];

        });

    }

    findClasses(code) {

        const matches = code.match(
            /class\s+([A-Za-z0-9_]+)/g
        ) || [];

        return matches.map(line =>

            line.replace("class", "").trim()

        );

    }

    findFunctions(code) {

        const matches = code.match(
            /function\s+([A-Za-z0-9_]+)/g
        ) || [];

        return matches.map(line =>

            line.replace("function", "").trim()

        );

    }

    findMethods(code) {

        const regex = /^\s*([A-Za-z0-9_]+)\s*\(/gm;

        const methods = [];

        let match;

        while ((match = regex.exec(code)) !== null) {

            const name = match[1];

            if (
                name !== "if" &&
                name !== "for" &&
                name !== "while" &&
                name !== "switch" &&
                name !== "catch"
            ) {

                methods.push(name);

            }

        }

        return [...new Set(methods)];

    }

    findTodos(code) {

        const matches = code.match(
            /\/\/\s*TODO.*$/gm
        ) || [];

        return matches;

    }

    findComments(code) {

        const matches = code.match(
            /\/\/.*$/gm
        ) || [];

        return matches;

    }

}
