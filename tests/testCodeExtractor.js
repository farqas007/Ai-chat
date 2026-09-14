import fs from "fs";

import { CodeExtractor } from "../agent/codeExtractor.js";

const code = fs.readFileSync(
    "js/app.js",
    "utf8"
);

const extractor = new CodeExtractor();

const result = extractor.extract(code);

console.log(result);

console.log();

console.log("Imports:", result.imports.length);

console.log("Exports:", result.exports.length);

console.log("Classes:", result.classes.length);

console.log("Functions:", result.functions.length);

console.log("Methods:", result.methods.length);

console.log("Todos:", result.todos.length);

console.log("Comments:", result.comments.length);
