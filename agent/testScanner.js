import { WorkspaceScanner } from "../agent/workspaceScanner.js";

const scanner = new WorkspaceScanner();

const files = scanner.scan(".");

console.log(files);