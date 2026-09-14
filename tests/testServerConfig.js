/* ===========================================================
   Test: server runtime configuration resolver (deployment).

   Verifies PORT/HOST/CORS resolution used by server.js:
   - default port 3000, host 0.0.0.0
   - process.env.PORT is honored (including "0" ephemeral binds)
   - invalid PORT falls back to 3000
   - HOST override works
   - CORS_ORIGIN comma allowlist parsing
=========================================================== */


import assert from "node:assert";


import { resolveServerConfig } from "../server/serverConfig.js";


/* Defaults. */

{

    const config = resolveServerConfig({});

    assert.strictEqual(config.port, 3000);

    assert.strictEqual(config.host, "0.0.0.0");

    assert.deepStrictEqual(config.allowedOrigins, []);

}


/* PORT is honored. */

{

    const config = resolveServerConfig({ PORT: "8080" });

    assert.strictEqual(config.port, 8080);

    const numeric = resolveServerConfig({ PORT: 9090 });

    assert.strictEqual(numeric.port, 9090);

}


/* Ephemeral PORT "0" is allowed (used by tests + some platforms). */

{

    const config = resolveServerConfig({ PORT: "0" });

    assert.strictEqual(config.port, 0);

}


/* Invalid PORT falls back to 3000. */

{

    assert.strictEqual(resolveServerConfig({ PORT: "abc" }).port, 3000);

    assert.strictEqual(resolveServerConfig({ PORT: "-5" }).port, 3000);

    assert.strictEqual(resolveServerConfig({ PORT: "12.5" }).port, 3000);

}


/* HOST override. */

{

    assert.strictEqual(
        resolveServerConfig({ HOST: "127.0.0.1" }).host,
        "127.0.0.1"
    );

    assert.strictEqual(
        resolveServerConfig({ HOST: "  0.0.0.0  " }).host,
        "0.0.0.0"
    );

}


/* CORS_ORIGIN allowlist parsing. */

{

    const config = resolveServerConfig({
        CORS_ORIGIN: "https://app.example.com, https://dev.example.com"
    });

    assert.deepStrictEqual(config.allowedOrigins, [
        "https://app.example.com",
        "https://dev.example.com"
    ]);

    assert.deepStrictEqual(
        resolveServerConfig({ CORS_ORIGIN: "  " }).allowedOrigins,
        []
    );

}


/* Whitespace-only PORT falls back. */

{

    assert.strictEqual(resolveServerConfig({ PORT: "  " }).port, 3000);

}


console.log("Server Config: all tests passed.");