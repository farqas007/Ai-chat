import fs from "fs";

export class DependencyAnalyzer {

    analyze(files) {

        const graph = {};

        for (const file of files) {

            try {

                const code = fs.readFileSync(file, "utf8");

                const imports = [];

                const regex =
                    /import\s+.*?from\s+["'](.+?)["']/g;

                let match;

                while ((match = regex.exec(code)) !== null) {

                    imports.push(match[1]);

                }

                graph[file] = imports;

            }

            catch{

    graph[file] = [];

}

        }

        return graph;

    }

}
