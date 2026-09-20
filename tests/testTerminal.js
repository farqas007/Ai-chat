import assert from "node:assert";

import {
    runCommand
} from "../terminal/terminalAgent.js";


/* Terminal execution is disabled for security; all commands
   must return the safe refusal message. */

const blockedResult = await runCommand("rm -rf /");

assert.strictEqual(
    blockedResult,
    "Terminal execution is disabled for security.",
    "blocked command must return the disabled message"
);

const echoResult = await runCommand("echo hello");

assert.strictEqual(
    echoResult,
    "Terminal execution is disabled for security.",
    "even harmless commands must return the disabled message"
);

const emptyResult = await runCommand("");

assert.strictEqual(
    emptyResult,
    "Terminal execution is disabled for security.",
    "empty command must return the disabled message"
);

const nullResult = await runCommand(null);

assert.strictEqual(
    nullResult,
    "Terminal execution is disabled for security.",
    "null command must return the disabled message"
);


console.log("PASS: terminal refuses all commands (execution disabled for security)");
