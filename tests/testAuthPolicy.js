import { resolveAuthPolicy } from "../server/authPolicy.js";


const passed = [];
const failed = [];

function assert(name, condition) {
    if (condition) {
        passed.push(name);
        console.log(`PASS: ${name}`);
    } else {
        failed.push(name);
        console.log(`FAIL: ${name}`);
    }
}


// Production must ALWAYS fail closed, regardless of ALLOW_NO_AUTH.
assert(
    "production + no token -> auth NOT disabled",
    resolveAuthPolicy({ NODE_ENV: "production" }).authDisabled === false
);

assert(
    "production alias 'prod' + no token -> auth NOT disabled",
    resolveAuthPolicy({ NODE_ENV: "prod" }).authDisabled === false
);

assert(
    "production + ALLOW_NO_AUTH + no token -> auth NOT disabled",
    resolveAuthPolicy({ NODE_ENV: "production", ALLOW_NO_AUTH: "true" }).authDisabled === false
);

assert(
    "production + API_TOKEN set -> auth NOT disabled",
    resolveAuthPolicy({ NODE_ENV: "production", SERVER_API_TOKEN: "secret" }).authDisabled === false
);

assert(
    "production NODE_ENV 'Production' (mixed case) -> isProduction true",
    resolveAuthPolicy({ NODE_ENV: "Production" }).isProduction === true
);


// Development is open ONLY when explicitly opted in AND no token is set.
assert(
    "development + ALLOW_NO_AUTH=true + no token -> auth DISABLED",
    resolveAuthPolicy({ NODE_ENV: "development", ALLOW_NO_AUTH: "true" }).authDisabled === true
);

assert(
    "development (NODE_ENV unset) + ALLOW_NO_AUTH=true + no token -> auth DISABLED",
    resolveAuthPolicy({ ALLOW_NO_AUTH: "true" }).authDisabled === true
);

assert(
    "development + no ALLOW_NO_AUTH + no token -> auth NOT disabled (fails closed)",
    resolveAuthPolicy({ NODE_ENV: "development" }).authDisabled === false
);

assert(
    "development + ALLOW_NO_AUTH=false + no token -> auth NOT disabled",
    resolveAuthPolicy({ NODE_ENV: "development", ALLOW_NO_AUTH: "false" }).authDisabled === false
);


// A configured token is ALWAYS authoritative over ALLOW_NO_AUTH.
assert(
    "token present + ALLOW_NO_AUTH=true -> token still enforced",
    resolveAuthPolicy({ NODE_ENV: "development", ALLOW_NO_AUTH: "true", SERVER_API_TOKEN: "x" }).authDisabled === false
);

assert(
    "token preserved through policy",
    resolveAuthPolicy({ SERVER_API_TOKEN: "abc123" }).apiToken === "abc123"
);

assert(
    "no token anywhere -> apiToken empty string",
    resolveAuthPolicy({}).apiToken === ""
);


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}