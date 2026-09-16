import assert from "node:assert";

import { DiffEngine } from "../agent/diffEngine.js";


const engine = new DiffEngine();

const oldCode = `

function hello(){

    console.log("Hello");

}

`;

const newCode = `

function hello(){

    console.log("Hello World");

}

`;


/* Changed input produces a change record with both versions. */

const changed = engine.create(oldCode, newCode);

assert.strictEqual(
    changed.changed,
    true,
    "different inputs must be marked changed"
);

assert.strictEqual(
    changed.original,
    oldCode,
    "change record must preserve the original code"
);

assert.strictEqual(
    changed.updated,
    newCode,
    "change record must preserve the updated code"
);


/* Applying the change must yield the updated code. */

const applied = engine.apply(oldCode, changed);

assert.strictEqual(
    applied,
    newCode,
    "applying a changed diff must return the updated code"
);


/* Identical input produces a non-change and applies to the original. */

const same = engine.create(oldCode, oldCode);

assert.strictEqual(
    same.changed,
    false,
    "identical inputs must not be marked changed"
);

assert.strictEqual(
    engine.apply(oldCode, same),
    oldCode,
    "applying a non-change must return the original code"
);


/* A manually crafted non-change diff is ignored even with an updated field. */

assert.strictEqual(
    engine.apply(oldCode, { changed: false, updated: "IGNORED" }),
    oldCode,
    "a non-changed diff must never apply its updated field"
);


console.log("PASS: diff engine detects changes and applies updates correctly");