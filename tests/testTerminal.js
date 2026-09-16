import assert from "node:assert";

import {
    runCommand
} from "../terminal/terminalAgent.js";


/* Blocked commands must never execute; they resolve to a safety message. */

const blockedResult = await runCommand("rm -rf /");

assert.strictEqual(
    blockedResult,
    "Command blocked for safety",
    "blocked command must be refused with the safety message"
);


/* A harmless fixed command must return its actual output. */

const okResult = await runCommand("echo hello");

assert.strictEqual(
    typeof okResult,
    "string",
    "successful command must resolve to a string"
);

assert.ok(
    okResult.includes("hello"),
    "successful command output must contain the echoed text"
);


console.log("PASS: terminal refuses blocked commands and returns real output");