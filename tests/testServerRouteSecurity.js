/* ===========================================================
   F5 — HTTP security/runtime integration tests for the real
   Express server (server/server.js).

   Each scenario boots the ACTUAL server as a child process with
   PORT=0 (ephemeral bind, no port conflicts) and drives it with
   real HTTP requests. No external API keys and no outbound
   network calls are involved:

     Server A (ALLOW_NO_AUTH=true): verifies the /file, /codex,
       /codex/analyze-file, /generate-image, /generate-image/:id
       and /api/chat routes reject traversal, absolute and
       sensitive paths, require required fields, fail closed when
       provider keys are missing, and never expose private static
       files.
     Server B (SERVER_API_TOKEN set): verifies the fail-closed
       auth boundary — every protected route returns 401 without a
       token, and both Bearer-token and session-cookie auth reach
       protected files.

   No repository files are modified: the only file writes that are
   ever attempted target paths either outside the sandbox (which
   the guard must reject) or sensitive runtime paths (also
   rejected). Children are always killed in a finally block.
=========================================================== */

import assert from "node:assert";

import { spawn } from "node:child_process";

import fs from "node:fs";

import path from "node:path";

import { fileURLToPath } from "node:url";


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


/* Spawn the real server and resolve with its bound port once the
   listen line appears on stdout. Hard timeout keeps the test from
   hanging if the server never starts. */
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

        child.stdout.on("data", chunk => {
            output += chunk;
            const match = output.match(/running on http:\/\/[^:]+:(\d+)/);
            if (match) {
                finish(null, Number(match[1]));
            }
        });

        child.stderr.on("data", chunk => {
            output += chunk;
            const match = output.match(/running on http:\/\/[^:]+:(\d+)/);
            if (match) {
                finish(null, Number(match[1]));
            }
        });

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


async function request(port, routePath, { method = "GET", headers = {}, body } = {}) {

    const init = { method, headers: { ...headers } };

    if (body !== undefined) {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
    }

    const response = await fetch(`http://127.0.0.1:${port}${routePath}`, init);

    const text = await response.text();

    let json = null;

    try {
        json = JSON.parse(text);
    } catch {
        json = null;
    }

    return { status: response.status, headers: response.headers, json, text };

}


async function expectJsonError(checkName, response, expectedStatus, expectedError) {

    check(
        checkName,
        response.status === expectedStatus &&
        response.json &&
        response.json.success === false &&
        response.json.error === expectedError,
        `status=${response.status} body=${response.text}`
    );

}


const BASE = "SERVER_API_TOKEN";


/* =========================================================
   SERVER A — no-auth dev mode: route/security behavior
========================================================= */

async function runNoAuthServer() {

    const escapePath = path.resolve(repoRoot, "..", "f5-pathguard-escape.txt");

    fs.rmSync(escapePath, { force: true }); // clean slate; never written

    const { child, port } = await spawnServer({ ALLOW_NO_AUTH: "true" });

    try {

        const health = await request(port, "/api/health");

        check(
            "A health endpoint public and ok",
            health.status === 200 &&
            health.json &&
            health.json.success === true
        );


        /* ---- /file ---- */

        const okFile = await request(
            port,
            `/file?path=${encodeURIComponent("package.json")}`
        );

        check(
            "A /file reads a real project file (200)",
            okFile.status === 200 &&
            okFile.json &&
            okFile.json.success === true &&
            okFile.json.path === "package.json" &&
            typeof okFile.json.content === "string" &&
            okFile.json.content.includes("ai-chat")
        );

        const missingPath = await request(port, "/file");

        await expectJsonError(
            "A /file without path -> 400 File path missing",
            missingPath,
            400,
            "File path missing"
        );

        let r = await request(
            port,
            `/file?path=${encodeURIComponent("../package.json")}`
        );

        await expectJsonError(
            "A /file parent traversal -> 403 Access denied",
            r,
            403,
            "Access denied"
        );

        r = await request(
            port,
            `/file?path=${encodeURIComponent("/etc/hostname")}`
        );

        await expectJsonError(
            "A /file absolute path -> 403 Access denied",
            r,
            403,
            "Access denied"
        );

        r = await request(
            port,
            `/file?path=${encodeURIComponent("server/server.js")}`
        );

        await expectJsonError(
            "A /file sensitive server/ path -> 403 Access denied",
            r,
            403,
            "Access denied"
        );

        r = await request(
            port,
            `/file?path=${encodeURIComponent("server/.env")}`
        );

        await expectJsonError(
            "A /file sensitive server/.env -> 403 Access denied",
            r,
            403,
            "Access denied"
        );

        r = await request(
            port,
            `/file?path=${encodeURIComponent("memory.json")}`
        );

        await expectJsonError(
            "A /file sensitive memory.json -> 403 Access denied",
            r,
            403,
            "Access denied"
        );

        r = await request(
            port,
            `/file?path=${encodeURIComponent("does-not-exist-f5.txt")}`
        );

        check(
            "A /file missing file -> 404 File not found",
            r.status === 404 &&
            r.json &&
            r.json.success === false &&
            r.json.error === "File not found",
            `status=${r.status} body=${r.text}`
        );


        /* ---- /codex ---- */

        r = await request(port, "/codex", { method: "POST", body: {} });

        await expectJsonError(
            "A /codex empty body -> 400 Task required",
            r,
            400,
            "Task required"
        );

        r = await request(port, "/codex", {
            method: "POST",
            body: { action: "delete", file: "package.json" }
        });

        await expectJsonError(
            "A /codex unknown action -> 400 Unknown file action",
            r,
            400,
            "Unknown file action"
        );

        r = await request(port, "/codex", {
            method: "POST",
            body: { action: "edit", file: "../f5-pathguard-escape.txt", content: "x" }
        });

        await expectJsonError(
            "A /codex traversal edit -> 403 Access denied",
            r,
            403,
            "Access denied"
        );

        check(
            "A /codex traversal never writes outside the sandbox",
            !fs.existsSync(escapePath)
        );

        r = await request(port, "/codex", {
            method: "POST",
            body: { action: "edit", file: "server/server.js", content: "x" }
        });

        await expectJsonError(
            "A /codex sensitive edit -> 403 Access denied",
            r,
            403,
            "Access denied"
        );


        /* ---- /codex/analyze-file ---- */

        r = await request(port, "/codex/analyze-file", {
            method: "POST",
            body: { file: "../package.json" }
        });

        await expectJsonError(
            "A /codex/analyze-file traversal -> 403 Access denied",
            r,
            403,
            "Access denied"
        );

        r = await request(port, "/codex/analyze-file", {
            method: "POST",
            body: { file: "backend/.env" }
        });

        await expectJsonError(
            "A /codex/analyze-file sensitive path -> 403 Access denied",
            r,
            403,
            "Access denied"
        );


        /* ---- /generate-image and /generate-image/:id ----
           REPLICATE_API_KEY is unset in this environment, so the
           routes fail closed with 503 without touching the
           network. Provider success paths need a live key and are
           covered at the helper level (testApiErrorHandling). */

        r = await request(port, "/generate-image", { method: "POST", body: {} });

        await expectJsonError(
            "A /generate-image no key -> 503 REPLICATE_API_KEY not configured.",
            r,
            503,
            "REPLICATE_API_KEY not configured."
        );

        r = await request(port, "/generate-image", {
            method: "POST",
            body: { prompt: "a cat" }
        });

        await expectJsonError(
            "A /generate-image with prompt but no key -> 503",
            r,
            503,
            "REPLICATE_API_KEY not configured."
        );

        r = await request(port, "/generate-image/abc123");

        await expectJsonError(
            "A /generate-image/:id no key -> 503",
            r,
            503,
            "REPLICATE_API_KEY not configured."
        );

        r = await request(port, "/api/chat", {
            method: "POST",
            body: { message: "hi" }
        });

        await expectJsonError(
            "A /api/chat no provider key -> 503 fail closed",
            r,
            503,
            "OPENROUTER_API_KEY not configured on server."
        );


        /* ---- static allowlist at the HTTP boundary ---- */

        const protectedPaths = [
            "/server/server.js",
            "/server/.env",
            "/.env",
            "/package.json",
            "/memory.json",
            "/bugs.json",
            "/README.md"
        ];

        for (const p of protectedPaths) {
            const resp = await request(port, p);
            check(
                `A static guard blocks "${p}" -> 404`,
                resp.status === 404 &&
                resp.json &&
                resp.json.success === false,
                `status=${resp.status}`
            );
        }

        const publicAsset = await request(port, "/index.html");

        check(
            "A static guard serves /index.html -> 200",
            publicAsset.status === 200
        );

        const forbiddenMethod = await request(port, "/index.html", {
            method: "POST"
        });

        check(
            "A non-GET/HEAD request to static path -> 404",
            forbiddenMethod.status === 404
        );

    } finally {

        await stopServer(child);

    }

}


/* =========================================================
   SERVER B — auth enforced (fails closed)
========================================================= */

async function runAuthServer() {

    const token = "f5-test-secret-token";

    const { child, port } = await spawnServer({ [BASE]: token });

    try {

        const health = await request(port, "/api/health");

        check(
            "B health stays public without a token",
            health.status === 200 &&
            health.json &&
            health.json.success === true
        );

        const session = await request(port, "/api/session");

        check(
            "B /api/session without cookie -> authenticated false",
            session.status === 200 &&
            session.json &&
            session.json.authenticated === false
        );


        /* Protected routes reject unauthenticated requests. */

        let r = await request(
            port,
            `/file?path=${encodeURIComponent("package.json")}`
        );

        await expectJsonError(
            "B /file without token -> 401",
            r,
            401,
            "Unauthorized"
        );

        r = await request(port, "/codex", { method: "POST", body: {} });

        await expectJsonError(
            "B /codex without token -> 401",
            r,
            401,
            "Unauthorized"
        );

        r = await request(port, "/generate-image/abc123");

        await expectJsonError(
            "B /generate-image/:id without token -> 401",
            r,
            401,
            "Unauthorized"
        );

        r = await request(port, "/generate-image", {
            method: "POST",
            body: { prompt: "a cat" }
        });

        await expectJsonError(
            "B /generate-image without token -> 401",
            r,
            401,
            "Unauthorized"
        );

        r = await request(port, "/api/chat", {
            method: "POST",
            body: { message: "hi" }
        });

        await expectJsonError(
            "B /api/chat without token -> 401",
            r,
            401,
            "Unauthorized"
        );


        /* Wrong token is rejected. */

        r = await request(
            port,
            `/file?path=${encodeURIComponent("package.json")}`,
            { headers: { Authorization: "Bearer wrong-token" } }
        );

        await expectJsonError(
            "B /file with wrong token -> 401",
            r,
            401,
            "Unauthorized"
        );


        /* Correct Bearer token reaches protected files. */

        r = await request(
            port,
            `/file?path=${encodeURIComponent("package.json")}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        check(
            "B /file with correct Bearer token -> 200",
            r.status === 200 &&
            r.json &&
            r.json.success === true,
            `status=${r.status} body=${r.text}`
        );


        /* Login flow hands out a working session cookie. */

        r = await request(port, "/api/login", {
            method: "POST",
            body: { password: "wrong-password" }
        });

        await expectJsonError(
            "B /api/login wrong password -> 401",
            r,
            401,
            "Invalid password"
        );

        r = await request(port, "/api/login", {
            method: "POST",
            body: {}
        });

        await expectJsonError(
            "B /api/login missing password -> 401",
            r,
            401,
            "Invalid password"
        );

        r = await request(port, "/api/login", {
            method: "POST",
            body: { password: token }
        });

        const setCookie = r.headers.get("set-cookie") || "";

        check(
            "B correct password -> 200 with a session cookie",
            r.status === 200 &&
            r.json &&
            r.json.success === true &&
            setCookie.includes("ai_chat_session")
        );

        const cookieAttrs = setCookie.toLowerCase();

        check(
            "B plain-HTTP non-production cookie is NOT Secure (PH-03)",
            r.json.success === true &&
            setCookie.includes("ai_chat_session") &&
            cookieAttrs.includes("secure") === false
        );

        check(
            "B cookie keeps HttpOnly + SameSite=Strict",
            cookieAttrs.includes("httponly") &&
            cookieAttrs.includes("samesite=strict")
        );

        const cookieValue = setCookie.split(";")[0];

        r = await request(
            port,
            `/file?path=${encodeURIComponent("package.json")}`,
            { headers: { Cookie: cookieValue } }
        );

        check(
            "B /file with session cookie -> 200",
            r.status === 200 &&
            r.json &&
            r.json.success === true,
            `status=${r.status} body=${r.text}`
        );

    } finally {

        await stopServer(child);

    }

}


/* =========================================================
   SERVER C — production auth keeps the Secure cookie attribute
   (PH-03: Secure becomes conditional for plain-HTTP LAN/dev, but
   MUST remain set in production no matter what).
======================================================== */

async function runProductionAuthServer() {

    const token = "f5-prod-secret-token";

    const { child, port } = await spawnServer({
        [BASE]: token,
        NODE_ENV: "production"
    });

    try {

        const r = await request(port, "/api/login", {
            method: "POST",
            body: { password: token }
        });

        check(
            "C production login still works over the test transport",
            r.status === 200 && r.json && r.json.success === true,
            `status=${r.status} body=${r.text}`
        );

        const setCookie = r.headers.get("set-cookie") || "";
        const cookieAttrs = setCookie.toLowerCase();

        check(
            "C production cookie STILL carries Secure (PH-03)",
            setCookie.includes("ai_chat_session") &&
            cookieAttrs.includes("secure") === true,
            `set-cookie=${setCookie}`
        );

        check(
            "C production cookie keeps HttpOnly + SameSite=Strict",
            cookieAttrs.includes("httponly") &&
            cookieAttrs.includes("samesite=strict")
        );

    } finally {

        await stopServer(child);

    }

}


await runNoAuthServer();

await runAuthServer();

await runProductionAuthServer();


console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}