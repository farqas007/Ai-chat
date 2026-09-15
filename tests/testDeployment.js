/* ===========================================================
   Test: deployment readiness.

   Three layers of checks:

   1. LIVE checks (only when express/cors/dotenv are installed,
      i.e. in a deploy-like environment): boots the real server
      on an ephemeral socket and verifies /api/health, static
      serving, fails-closed auth, unknown-route 404s and CORS.

   2. SOURCE checks (always): route/auth/CORS wiring present in
      server.js, protected endpoints fail closed by construction,
      health response is static with no secrets.

   3. STATIC scans (always):
      - no hardcoded localhost/127.0.0.1/local ports in frontend JS
      - frontend endpoints are same-origin relative paths
      - index.html asset paths are relative (deployable)
      - no real-looking secrets in any committed source file

   This test does NOT require a real external deployment.
=========================================================== */


import assert from "node:assert";

import { spawn } from "node:child_process";

import fs from "node:fs";

import path from "node:path";

import { fileURLToPath } from "node:url";

import { resolveAuthPolicy } from "../server/authPolicy.js";


const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const repoRoot = path.join(__dirname, "..");


const sleep = ms => new Promise(r => setTimeout(r, ms));


async function waitFor(condition, ms = 12000) {

    const start = Date.now();

    while (Date.now() - start < ms) {

        const result = await condition();

        if (result) {

            return result;

        }

        await sleep(80);

    }

    return null;

}


function readRepo(relativePath) {

    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

}


function repoSourceFiles(dir) {

    return fs.readdirSync(path.join(repoRoot, dir))
        .filter(name => name.endsWith(".js"))
        .map(name => path.join(dir, name));

}


/* -----------------------------------------------------------
   1. LIVE server checks (dependencies must be installed).
----------------------------------------------------------- */

let liveRan = false;

async function runLiveChecks() {

    try {

        await import("express");

        await import("cors");

        await import("dotenv");

    } catch (error) {

        console.log(
            "Deployment: server deps (express etc.) not installed — " +
            "skipping live-server checks, using source-level checks instead."
        );

        return;

    }

    let serverProc = null;

    let serverLog = "";

    try {

        const env = {
            ...process.env,
            PORT: "0",
            HOST: "127.0.0.1",
            NODE_ENV: "",
            SERVER_API_TOKEN: "deployment-test-token-0000",
            ALLOW_NO_AUTH: "",
            CORS_ORIGIN: "https://app.example.com"
        };

        serverProc = spawn(
            process.execPath,
            ["server/server.js"],
            {
                cwd: repoRoot,
                env,
                stdio: ["ignore", "pipe", "pipe"]
            }
        );

        serverProc.stdout.on("data", chunk => {

            serverLog += chunk.toString();

        });

        serverProc.stderr.on("data", chunk => {

            serverLog += chunk.toString();

        });

        const match = await waitFor(() => {

            return /AI Chat Server running on http:\/\/127\.0\.0\.1:(\d+)/.exec(serverLog);

        });

        assert.ok(match, "server started and logged a bound port");

        const port = Number(match[1]);

        assert.ok(
            Number.isInteger(port) && port > 0,
            `server logged a valid bound port (got: ${match[1]})`
        );

        const base = `http://127.0.0.1:${port}`;

        /* /api/health reachable, no secrets leaked. */

        const health = await fetch(`${base}/api/health`);

        assert.strictEqual(health.status, 200);

        const healthBody = await health.json();

        assert.strictEqual(healthBody.success, true);

        assert.strictEqual(healthBody.status, "Running");

        assert.ok(
            !/api[_-]?key|token|secret|OPENROUTER|REPLICATE/i.test(JSON.stringify(healthBody)),
            "health response must not expose keys or config"
        );

        /* Static frontend reachable. */

        const index = await fetch(`${base}/`);

        assert.strictEqual(index.status, 200);

        assert.ok((await index.text()).includes("AI Chat"), "index page content served");

        for (const asset of ["/css/style.css", "/css/themes.css", "/js/main.js"]) {

            assert.strictEqual(
                (await fetch(`${base}${asset}`)).status,
                200,
                `${asset} must be served`
            );

        }

        /* Protected endpoint fails closed without a token. */

        const protectedRes = await fetch(`${base}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "hello" })
        });

        assert.notStrictEqual(protectedRes.status, 200);
        assert.ok(protectedRes.status >= 400 && protectedRes.status < 500);
        assert.strictEqual((await protectedRes.json()).success, false);

        /* Streaming mode fails closed without a token too. */

        const streamRes = await fetch(`${base}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "hello", stream: true })
        });

        assert.notStrictEqual(streamRes.status, 200);
        assert.ok(streamRes.status >= 400 && streamRes.status < 500);
        assert.strictEqual((await streamRes.json()).success, false);

        /* Unknown API route 404s safely. */

        assert.strictEqual(
            (await fetch(`${base}/api/does-not-exist`)).status,
            404
        );

        /* CORS allowlist — no wildcard. */

        assert.strictEqual(
            (await fetch(`${base}/api/health`, { headers: { Origin: "https://app.example.com" } }))
                .headers.get("access-control-allow-origin"),
            "https://app.example.com"
        );

        assert.ok(
            !(await fetch(`${base}/api/health`, { headers: { Origin: "https://evil.example" } }))
                .headers.get("access-control-allow-origin")
        );

        liveRan = true;

    } finally {

        if (serverProc) {

            serverProc.kill("SIGTERM");

            await sleep(150);

            if (serverProc.exitCode === null) {

                serverProc.kill("SIGKILL");

            }

        }

    }

}


/* -----------------------------------------------------------
   2. SOURCE-level deployment checks (always run).
----------------------------------------------------------- */

function runSourceChecks(serverSource) {

    assert.ok(
        serverSource.includes('app.get("/api/health"'),
        "health route is present"
    );

    assert.ok(
        serverSource.includes('app.post("/api/chat"') &&
            /app\.post\("\/api\/chat",\s*\n\s*requireAuth/.test(serverSource),
        "/api/chat posts go through requireAuth"
    );

    assert.ok(
        /app\.post\("\/generate-image",\s*\n\s*requireAuth/.test(serverSource),
        "image generation goes through requireAuth"
    );

    assert.ok(
        /app\.post\("\/codex",\s*\n\s*requireAuth/.test(serverSource),
        "codex goes through requireAuth"
    );

    assert.ok(
        serverSource.includes("resolveServerConfig(process.env)"),
        "PORT/HOST come from the environment"
    );

    assert.ok(
        /app\.listen\((PORT|PORT),\s*(HOST|\"0\.0\.0\.0\")/.test(serverSource) &&
            serverSource.includes("HOST"),
        "server binds the configured HOST"
    );

    assert.ok(
        serverSource.includes("ALLOWED_ORIGINS"),
        "CORS uses the origin allowlist"
    );

    assert.ok(
        !serverSource.includes('origin: "*"'),
        "CORS is never a wildcard"
    );

    /* Auth policy cannot fall back to open mode in production. */

    assert.strictEqual(
        resolveAuthPolicy({ NODE_ENV: "production" }).authDisabled,
        false,
        "production never disables auth"
    );

    assert.strictEqual(
        resolveAuthPolicy({ NODE_ENV: "production", SERVER_API_TOKEN: "t" }).authDisabled,
        false
    );

    /* Protected endpoint fails closed on an unconfigured token. */

    const noToken = resolveAuthPolicy({ NODE_ENV: "production" });

    assert.strictEqual(noToken.apiToken, "");

    assert.strictEqual(noToken.authDisabled, false);

}


/* -----------------------------------------------------------
   3. STATIC scans (always run).
----------------------------------------------------------- */

function runStaticScans() {

    const localPattern = /localhost|127\.0\.0\.1|:3000\b|:5502\b|:8080\b/;

    for (const file of repoSourceFiles("js")) {

        assert.ok(
            !localPattern.test(readRepo(file)),
            `${file} must not hardcode a local endpoint`
        );

    }

    /* Frontend endpoints are same-origin relative paths. */

    assert.ok(readRepo("js/api.js").includes('endpoint: "/api/chat"'));
    assert.ok(readRepo("js/imageGenerator.js").includes('endpoint: "/generate-image"'));
    assert.ok(readRepo("js/videoGenerator.js").includes('endpoint: "/generate-video"'));

    /* index.html uses deployable relative asset paths and they exist. */

    const indexSource = readRepo("index.html");

    assert.ok(!/href="http/.test(indexSource));
    assert.ok(!/src="http/.test(indexSource));
    assert.ok(!/src="\/\//.test(indexSource));
    assert.ok(indexSource.includes('href="css/'));
    assert.ok(indexSource.includes('src="js/'));

    for (const asset of [
        "css/themes.css",
        "css/style.css",
        "css/sidebar.css",
        "css/chat.css",
        "css/responsive.css",
        "js/main.js"
    ]) {

        assert.ok(fs.existsSync(path.join(repoRoot, asset)), `${asset} exists on disk`);
        assert.ok(indexSource.includes(asset), `${asset} referenced by index.html`);

    }

    /* No real-looking secrets in committed source files. */

    const secretPattern = /(sk-[A-Za-z0-9]{10,}|r8_[A-Za-z0-9]{10,})/;

    for (const dir of ["js", "server", "css"]) {

        for (const file of repoSourceFiles(dir)) {

            assert.ok(
                !secretPattern.test(readRepo(file)),
                `${file} must not contain real-looking API keys`
            );

        }

    }

    const envSource = readRepo(".env.example");

    assert.ok(envSource.includes("your_openrouter_api_key_here"));
    assert.ok(envSource.includes("your_replicate_api_key_here"));
    assert.ok(!secretPattern.test(envSource));

}


/* -----------------------------------------------------------
   Run everything.
----------------------------------------------------------- */

await runLiveChecks();

runSourceChecks(readRepo("server/server.js"));

runStaticScans();

console.log("Deployment Readiness: all tests passed.");