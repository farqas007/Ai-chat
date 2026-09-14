import { FileReader } from "../agent/fileReader.js";

const reader = new FileReader();

const result = reader.read("js/app.js");

console.log(result);

const many = reader.readMany([
    "js/app.js",
    "js/chat.js",
    "css/style.css"
]);

console.table(
    many.map(file => ({
        path: file.path,
        success: file.success,
        lines: file.lines,
        size: file.size
    }))
);
