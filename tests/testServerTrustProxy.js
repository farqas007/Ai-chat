/* ===========================================================
   PH-04 — reverse-proxy / rate-limit handling for the real
   Express server (server/server.js).

   Root cause: the server never configured Express "trust proxy",
   so behind a reverse proxy / load balancer req.ip is the proxy's
   address and every user behind it shares ONE IP rate-limit
   bucket. Fix: env-gated TRUST_PROXY - off by default so spoofed
   X-Forwarded-For headers from direct/untrusted clients are
   ignored (rate limiting keys on the real connection), and only
   enabled explicitly by the operator.

   Each scenario boots the ACTUAL server on an ephemeral port and
   drives it with real HTTP against /api/login (its rate limiter
   allows 10 req/min per IP, and runs before auth).

     Server D (default, no TRUST_PROXY)      : direct client
       sends SPOOFED X-Forwarded-For headers. They must be
       IGNORED - every request lands in one socket-IP bucket and
       the 11th is rate-limited. Proves no blind header trust.
     Server E (TRUST_PROXY=127.0.0.1/32)     : trusted proxy
       subnet allowlist. X-Forwarded-For IS honoured: same real
       client IP hits the limit, a different client IP gets its
       own bucket. Proves correct client-IP extraction for rate
       limiting behind a trusted proxy.
     Server F (TRUST_PROXY=1)                : single-hop proxy.
       Multi-hop X-Forwarded-For resolves to the rightmost
       untrusted address. Proves the hop-count form works.
=========================================================== */

import assert from "node:assert";

import { spawn } from "node:child_process";

import path from "node:path";

import { fileURLToPath } from "node:url";

import { resolveServerConfig } from "../server/serverConfig.js";


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
   listen line appears on stdout. */
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


const TOKEN = "ph4-test-secret-token";


/* =========================================================
   CONFIG — resolveTrustProxy parsing (fail-closed default)
========================================================= */

function runConfigChecks() {

    const cases = [
        ["no TRUST_PROXY -> false", {}, false],
        ["TRUST_PROXY=false -> false", { TRUST_PROXY: "false" }, false],
        ["TRUST_PROXY=true -> true", { TRUST_PROXY: "true" }, true],
        ["TRUST_PROXY=2 -> hop count 2", { TRUST_PROXY: "2" }, 2],
        ["TRUST_PROXY=loopback -> loopback", { TRUST_PROXY: "loopback" }, "loopback"],
        [
            "TRUST_PROXY subnet allowlist -> array",
            { TRUST_PROXY: "10.0.0.0/8, 172.16.0.0/12" },
            ["10.0.0.0/8", "172.16.0.0/12"]
        ],
        [
            "garbage TRUST_PROXY -> false (fail closed)",
            { TRUST_PROXY: "trust-everything-please" },
            false
        ]
    ];

    for (const [name, env, expected] of cases) {
        check(
            `C ${name}`,
            assert.deepStrictEqual(
                resolveServerConfig(env).trustProxy,
                expected
            ) === undefined,
            JSON.stringify(resolveServerConfig(env).trustProxy)
        );
    }

}


/* =========================================================
   SERVER D — default (no TRUST_PROXY): spoofed forwarded
   headers from a direct/untrusted client are ignored.
========================================================= */

async function runDirectUntrustedServer() {

    const { child, port } = await spawnServer({ SERVER_API_TOKEN: TOKEN });

    try {

        const statuses = [];

        for (let i = 0; i < 10; i++) {
            const r = await request(port, "/api/login", {
                method: "POST",
                headers: {
                    "X-Forwarded-For": `203.0.113.${i + 1}`
                },
                body: { password: "wrong-password" }
            });
            statuses.push(r.status);
        }

        check(
            "D spoofed XFF requests reach the login handler (401)",
            statuses.length === 10 &&
            statuses.every(status => status === 401),
            JSON.stringify(statuses)
        );

        const eleventh = await request(port, "/api/login", {
            method: "POST",
            headers: {
                "X-Forwarded-For": "203.0.113.99"
            },
            body: { password: "wrong-password" }
        });

        check(
            "D 11th request with a NEW spoofed XFF is rate-limited (429) - header ignored, one socket-IP bucket",
            eleventh.status === 429 &&
            eleventh.json &&
            eleventh.json.success === false,
            `status=${eleventh.status} body=${eleventh.text}`
        );

        const noHeader = await request(port, "/api/login", {
            method: "POST",
            body: { password: "wrong-password" }
        });

        check(
            "D request without XFF stays rate-limited (429) - keyed on the real connection",
            noHeader.status === 429,
            `status=${noHeader.status}`
        );

    } finally {

        await stopServer(child);

    }

}


/* =========================================================
   SERVER E — TRUST_PROXY=127.0.0.1/32: trusted reverse proxy
   present; X-Forwarded-For resolves to the real client IP.
========================================================= */

async function runTrustedProxyServer() {

    const { child, port } = await spawnServer({
        SERVER_API_TOKEN: TOKEN,
        TRUST_PROXY: "127.0.0.1/32"
    });

    try {

        const statuses = [];

        for (let i = 0; i < 10; i++) {
            const r = await request(port, "/api/login", {
                method: "POST",
                headers: {
                    "X-Forwarded-For": "203.0.113.7"
                },
                body: { password: "wrong-password" }
            });
            statuses.push(r.status);
        }

        check(
            "E 10 requests from ONE forwarded client IP reach login (401)",
            statuses.length === 10 &&
            statuses.every(status => status === 401),
            JSON.stringify(statuses)
        );

        const eleventh = await request(port, "/api/login", {
            method: "POST",
            headers: {
                "X-Forwarded-For": "203.0.113.7"
            },
            body: { password: "wrong-password" }
        });

        check(
            "E 11th from the same forwarded client IP is rate-limited (429) - per-real-client bucket",
            eleventh.status === 429 &&
            eleventh.json &&
            eleventh.json.success === false,
            `status=${eleventh.status} body=${eleventh.text}`
        );

        const otherClient = await request(port, "/api/login", {
            method: "POST",
            headers: {
                "X-Forwarded-For": "198.51.100.9"
            },
            body: { password: "wrong-password" }
        });

        check(
            "E a DIFFERENT forwarded client IP gets a fresh bucket (401, not 429) - no proxy-IP pooling",
            otherClient.status === 401,
            `status=${otherClient.status} body=${otherClient.text}`
        );

    } finally {

        await stopServer(child);

    }

}


/* =========================================================
   SERVER F — TRUST_PROXY=1 (single-hop proxy): multi-hop
   X-Forwarded-For is resolved to the rightmost untrusted
   address for rate limiting.
========================================================= */

async function runHopCountProxyServer() {

    const { child, port } = await spawnServer({
        SERVER_API_TOKEN: TOKEN,
        TRUST_PROXY: "1"
    });

    try {

        const statuses = [];

        for (let i = 0; i < 10; i++) {
            const r = await request(port, "/api/login", {
                method: "POST",
                headers: {
                    "X-Forwarded-For": "198.51.100.9, 203.0.113.7"
                },
                body: { password: "wrong-password" }
            });
            statuses.push(r.status);
        }

        check(
            "F 10 requests from the resolved client IP reach login (401)",
            statuses.length === 10 &&
            statuses.every(status => status === 401),
            JSON.stringify(statuses)
        );

        const eleventh = await request(port, "/api/login", {
            method: "POST",
            headers: {
                "X-Forwarded-For": "198.51.100.9, 203.0.113.7"
            },
            body: { password: "wrong-password" }
        });

        check(
            "F 11th from the same resolved client IP is rate-limited (429) - hop-count parses",
            eleventh.status === 429 &&
            eleventh.json &&
            eleventh.json.success === false,
            `status=${eleventh.status} body=${eleventh.text}`
        );

        const hopTrusted = await request(port, "/api/login", {
            method: "POST",
            headers: {
                "X-Forwarded-For": "192.0.2.55"
            },
            body: { password: "wrong-password" }
        });

        check(
            "F a DIFFERENT forwarded client IP gets a fresh bucket (401, not 429) under hop-count trust",
            hopTrusted.status === 401,
            `status=${hopTrusted.status} body=${hopTrusted.text}`
        );

    } finally {

        await stopServer(child);

    }

}


await runConfigChecks();

await runDirectUntrustedServer();

await runTrustedProxyServer();

await runHopCountProxyServer();


console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}