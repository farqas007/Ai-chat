/* ===========================================================
   Regression tests — BUG-4: non-string image prompt must be a
   400 client error, never a 502 upstream error.

   Before BUG-4 the route used `!prompt || !prompt.trim()`, so a
   numeric/object prompt threw a TypeError that fell through to the
   generic upstream handler (502). After BUG-4 both the Node server
   and the Workers app use the shared isValidImagePrompt() helper:

     P1: helper rejects number/object/array/null/undefined/empty/
         whitespace and accepts non-empty strings.
     P2: the real Node /generate-image route returns 400 for every
         invalid prompt shape.
     P3: Node and Worker wire the shared validator (old inline
         trim validation is gone).
=========================================================== */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isValidImagePrompt, MAX_IMAGE_PROMPT_LENGTH } from "../server/imagePrompt.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

let passed = 0;
let failed = 0;

function check(name, condition, message) {
    if (condition) {
        passed += 1;
        console.log(`PASS: ${name}`);
    } else {
        failed += 1;
        console.log(`FAIL: ${name} -- ${message || ""}`);
    }
}


/* -----------------------------------------------------------
   P1 — shared helper semantics.
----------------------------------------------------------- */

check("P1 numeric prompt rejected", isValidImagePrompt(123) === false);
check("P1 object prompt rejected", isValidImagePrompt({}) === false);
check("P1 array prompt rejected", isValidImagePrompt([]) === false);
check("P1 null prompt rejected", isValidImagePrompt(null) === false);
check("P1 undefined prompt rejected", isValidImagePrompt(undefined) === false);
check("P1 boolean prompt rejected", isValidImagePrompt(true) === false);
check("P1 empty string rejected", isValidImagePrompt("") === false);
check("P1 whitespace-only rejected", isValidImagePrompt("   \t\n") === false);
check("P1 valid string accepted", isValidImagePrompt("a cat") === true);
check("P1 padded valid string accepted", isValidImagePrompt("  a cat  ") === true);


/* -----------------------------------------------------------
   P1b — max prompt length (FIX-08).
----------------------------------------------------------- */

check("P1b MAX_IMAGE_PROMPT_LENGTH is 10000", MAX_IMAGE_PROMPT_LENGTH === 10_000);

check(
    "P1b prompt at max length accepted",
    isValidImagePrompt("a".repeat(MAX_IMAGE_PROMPT_LENGTH)) === true
);

check(
    "P1b prompt over max length rejected",
    isValidImagePrompt("a".repeat(MAX_IMAGE_PROMPT_LENGTH + 1)) === false
);


/* -----------------------------------------------------------
   P3 — source wiring: shared validator used, old pattern gone.
----------------------------------------------------------- */

const serverSource = fs.readFileSync(
    path.join(repoRoot, "server/server.js"),
    "utf8"
);

const workerSource = fs.readFileSync(
    path.join(repoRoot, "worker/index.js"),
    "utf8"
);

check(
    "P3 server uses isValidImagePrompt(prompt)",
    serverSource.includes("isValidImagePrompt(prompt)")
);

check(
    "P3 worker uses isValidImagePrompt(prompt)",
    workerSource.includes("isValidImagePrompt(prompt)")
);

check(
    "P3 worker imports the shared helper",
    workerSource.includes('from "../server/imagePrompt.js"')
);

check(
    "P3 server no longer uses inline `!prompt || !prompt.trim()`",
    !serverSource.includes("!prompt || !prompt.trim()")
);

check(
    "P3 worker no longer uses inline `!prompt || !prompt.trim()`",
    !workerSource.includes("!prompt || !prompt.trim()")
);


/* -----------------------------------------------------------
   P4 — GET /generate-image/:id maps only safe fields (FIX-07).
----------------------------------------------------------- */

check(
    "P4 server GET /generate-image/:id maps id, status, output",
    serverSource.includes("id: data.id") &&
    serverSource.includes("status: data.status") &&
    serverSource.includes("output: data.output")
);

check(
    "P4 server GET does not return raw response",
    !serverSource.includes("return res.json(data);")
);

check(
    "P4 worker GET /generate-image/:id maps id, status, output",
    workerSource.includes("id: data.id") &&
    workerSource.includes("status: data.status") &&
    workerSource.includes("output: data.output")
);

check(
    "P4 worker GET does not return raw response",
    !workerSource.includes("return res.json(data);")
);


/* -----------------------------------------------------------
   P5 — CORS origin comparison is case-insensitive (FIX-09).
----------------------------------------------------------- */

check(
    "P5 server CORS uses case-insensitive comparison",
    serverSource.includes("allowed.toLowerCase() === normalized")
);

check(
    "P5 worker CORS uses case-insensitive comparison",
    workerSource.includes("allowed.toLowerCase() === normalized")
);


/* -----------------------------------------------------------
   P6 — stream error always emitted before close (FIX-10).
----------------------------------------------------------- */

const streamServerSource = fs.readFileSync(
    path.join(repoRoot, "server/streamChat.js"),
    "utf8"
);

const streamWorkerSource = fs.readFileSync(
    path.join(repoRoot, "worker/streamChat.js"),
    "utf8"
);

check(
    "P6 server errorEvent does not silently skip on clientClosed",
    !streamServerSource.includes("if (clientClosed) {\n            return false;\n        }") &&
    !streamServerSource.match(/errorEvent\s*=\s*error\s*=>\s*\{\s*\n\s*if\s*\(clientClosed\)/)
);

check(
    "P6 worker errorEvent does not silently skip on settled",
    !streamWorkerSource.match(/errorEvent\s*=\s*error\s*=>\s*\{\s*\n\s*if\s*\(settled\)/)
);


/* -----------------------------------------------------------
   P2 — real Node route returns 400 for invalid prompt shapes.
   REPLICATE_API_KEY is a dummy value so the key gate passes and
   validation is reached. Invalid prompts return before any
   outbound request is made.
----------------------------------------------------------- */

function spawnServer(extraEnv) {

    return new Promise((resolve, reject) => {

        const child = spawn(
            process.execPath,
            ["server/server.js"],
            {
                cwd: repoRoot,
                env: { ...process.env, PORT: "0", ...extraEnv },
                stdio: ["ignore", "pipe", "pipe"]
            }
        );

        let output = "";
        let settled = false;

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                child.kill("SIGKILL");
                reject(new Error("server did not report its port in time"));
            }
        }, 15000);

        const finish = (err, port) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            if (err) {
                child.kill("SIGKILL");
                reject(err);
            } else {
                resolve({ child, port });
            }
        };

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        const onData = chunk => {
            output += chunk;
            const match = output.match(/running on http:\/\/[^:]+:(\d+)/);
            if (match) {
                finish(null, Number(match[1]));
            }
        };

        child.stdout.on("data", onData);
        child.stderr.on("data", onData);

        child.on("exit", () => {
            if (!settled) {
                finish(new Error("server exited before reporting its port"));
            }
        });

    });

}


function stopServer(child) {

    return new Promise(resolve => {

        if (!child || child.exitCode !== null) {
            return resolve();
        }

        child.on("exit", resolve);

        child.kill("SIGTERM");

        setTimeout(() => {
            if (child.exitCode === null) {
                child.kill("SIGKILL");
            }
        }, 2000).unref();

    });

}


async function runNodeRouteTests() {

    const { child, port } = await spawnServer({
        ALLOW_NO_AUTH: "true",
        REPLICATE_API_KEY: "test-fake-key"
    });

    try {

        const invalidPrompts = [
            { label: "numeric", value: 123 },
            { label: "object", value: { nested: true } },
            { label: "array", value: [ "a" ] },
            { label: "null", value: null },
            { label: "boolean", value: true },
            { label: "empty string", value: "" },
            { label: "whitespace", value: "   " }
        ];

        for (const { label, value } of invalidPrompts) {

            const response = await fetch(
                `http://127.0.0.1:${port}/generate-image`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt: value })
                }
            );

            const body = await response.text();

            check(
                `P2 Node route rejects ${label} prompt -> 400`,
                response.status === 400 &&
                body.includes("Prompt is required."),
                `status=${response.status} body=${body}`
            );

        }

    } finally {

        await stopServer(child);

    }

}


await runNodeRouteTests();


console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
