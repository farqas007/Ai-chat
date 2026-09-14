export class DependencyGraph {

    build(files = []) {

        const graph = new Map();

        for (const file of files) {

            const imports = this.findImports(
                file.content || ""
            );

            graph.set(file.path, imports);

        }

        return graph;

    }

    findImports(content = "") {

        const imports = [];

        const regex = /import\s+.*?from\s+["'](.+?)["']/g;

        let match;

        while ((match = regex.exec(content))) {

            imports.push(match[1]);

        }

        return imports;

    }

    getDependencies(file, graph) {

        return graph.get(file) || [];

    }

}