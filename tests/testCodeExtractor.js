import assert from "node:assert";

import { CodeExtractor } from "../agent/codeExtractor.js";


const code = `
import fs from "node:fs";
import path from "node:path";

class Greeter {
  greet(name) {
    return "Hi " + name;
  }
}

export function makeGreeter() {
  return new Greeter();
}

export const version = "1.0.0";

// TODO: add tests
// a comment
`;


const result = new CodeExtractor().extract(code);


assert.deepStrictEqual(
    result.imports,
    ["node:fs", "node:path"],
    "imports must resolve to the exact module specifiers"
);

assert.deepStrictEqual(
    result.exports,
    ["makeGreeter", "version"],
    "exports must be the exact exported names"
);

assert.deepStrictEqual(
    result.classes,
    ["Greeter"],
    "classes must be the exact declared classes"
);

assert.ok(
    result.functions.includes("makeGreeter"),
    "functions must include declared function names"
);

assert.deepStrictEqual(
    result.methods,
    ["greet"],
    "methods must be the exact method names"
);

assert.strictEqual(
    result.todos.length,
    1,
    "exactly one TODO comment expected"
);

assert.ok(
    result.todos[0].includes("TODO: add tests"),
    "TODO comment content must be captured"
);

assert.strictEqual(
    result.comments.length,
    2,
    "both // comments expected"
);

assert.ok(
    result.comments.some(c => c.includes("a comment")),
    "plain comments must be captured"
);


console.log("PASS: code extractor returns exact imports/exports/classes/methods");