import { createRequireAuth } from "../server/authMiddleware.js";


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


function makeRes() {
    const res = { statusCode: null, body: null, headers: {} };
    res.status = code => { res.statusCode = code; return res; };
    res.json = payload => { res.body = payload; return res; };
    res.setHeader = (key, value) => { res.headers[key] = value; return res; };
    return res;
}

function run(auth, req) {
    const res = makeRes();
    let nexted = false;
    auth(req, res, () => { nexted = true; });
    return { res, nexted };
}


const secured = createRequireAuth({
    authDisabled: false,
    apiToken: "secret123"
});

let { res } = run(secured, { headers: {} });
assert(
    "missing token -> 401",
    res.statusCode === 401 &&
    res.body && res.body.success === false
);

({ res } = run(secured, { headers: { authorization: "Bearer wrong-token" } }));
assert(
    "wrong token -> 401",
    res.statusCode === 401 &&
    res.body && res.body.success === false
);

let { nexted } = run(secured, { headers: { authorization: "Bearer secret123" } });
assert(
    "correct token -> allowed",
    nexted === true
);

({ nexted } = run(secured, { headers: { authorization: "bearer secret123" } }));
assert(
    "non-Bearer scheme not accepted",
    nexted === false
);


const unconfigured = createRequireAuth({
    authDisabled: false,
    apiToken: ""
});

({ res } = run(unconfigured, { headers: {} }));
assert(
    "no token configured -> 503 (fails closed)",
    res.statusCode === 503 &&
    res.body && res.body.success === false
);


const openDev = createRequireAuth({
    authDisabled: true,
    apiToken: ""
});

({ nexted } = run(openDev, { headers: {} }));
assert(
    "dev no-auth mode -> allowed without token",
    nexted === true
);


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}