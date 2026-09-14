import { ProjectIndexer } from "../agent/projectIndexer.js";
import { DependencyAnalyzer } from "../agent/dependencyAnalyzer.js";

const indexer = new ProjectIndexer(".");

const project = indexer.index();

const analyzer = new DependencyAnalyzer();

const graph = analyzer.analyze(project.js);

console.log(graph);

console.log("\n========== SUMMARY ==========");

console.log(
    "Files analyzed:",
    Object.keys(graph).length
);

for (const file in graph) {

    console.log(
        file,
        "->",
        graph[file].length,
        "imports"
    );

}
