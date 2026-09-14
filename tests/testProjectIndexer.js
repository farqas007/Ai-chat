import { ProjectIndexer } from "../agent/projectIndexer.js";

const indexer = new ProjectIndexer(".");

const result = indexer.index();

console.log(result);

console.log("\n========== SUMMARY ==========");

console.log("Folders :", result.totalFolders);
console.log("Files   :", result.totalFiles);

console.log("JS      :", result.js.length);
console.log("CSS     :", result.css.length);
console.log("HTML    :", result.html.length);
console.log("JSON    :", result.json.length);
console.log("OTHER   :", result.other.length);
