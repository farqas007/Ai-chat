import { ProjectScanner } from "../filesystem/projectScanner.js";
import { readFile } from "../filesystem/fileManager.js";

const scanner = new ProjectScanner("./");

const files = scanner.scan();

console.log("Project Files:");
console.log(files);


const index = await readFile("index.html");

console.log(index.slice(0, 200));