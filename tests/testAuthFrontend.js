/* ===========================================================
   Test: frontend login response handling (js/auth.js).

   Verifies the exact rule behind the overlay's error text:

   - A genuine HTTP 200 {"success":true} NEVER renders an error;
     it clears the field, hides the overlay and shows the logout
     button. The literal message "Invalid password" can therefore
     only ever come from a real server 401.
   - A server 401 {"success":false,"error":"Invalid password"}
     is rendered verbatim.
   - Surrounding whitespace in the pasted password is trimmed
     before being sent (fixes copy/paste artifacts).
   - The login request is POST to the same-origin /api/login and
     does not override fetch credentials (cookie still sent
     same-origin by default).
   - A network failure shows the generic connection message.
=========================================================== */


import "./setupAuthFrontend.js";

import { initAuth } from "../js/auth.js";

import {
    elements,
    fetchCalls,
    loginResponses,
    setSessionResponse,
    setFetchHandler
} from "./setupAuthFrontend.js";


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


const hasClass = (el, c) => el.classList.contains(c);


async function submit(password) {

    elements.loginPassword.value = password;

    const handler = elements.loginForm._handlers.submit[0];

    await handler({ preventDefault() {} });

}


setFetchHandler();

setSessionResponse({
    ok: true,
    status: 200,
    json: async () => ({ authenticated: true })
});

/* initAuth: session probe reports authenticated -> overlay stays hidden,
   logout button visible, and the login form listener is attached. */

await initAuth();

assert("overlay hidden after authenticated session probe", hasClass(elements.loginOverlay, "hidden"));

assert("logout button visible after authenticated session probe", !hasClass(elements.logoutBtn, "hidden"));

assert("two fetch calls so far (session probe only)", fetchCalls.length === 1);

assert("session probe used GET /api/session", fetchCalls[0].url === "/api/session" && fetchCalls[0].opts.method === "GET");

assert("login form submit listener attached once", elements.loginForm._handlers.submit.length === 1);


/* Scenario 1: server 401. Renders the server's message verbatim.
   Reuse the same form listener; first re-show the overlay and hide
   the logout button to mimic the unauthenticated state. */

elements.loginOverlay.classList.remove("hidden");

elements.logoutBtn.classList.add("hidden");

loginResponses.push({
    status: 401,
    body: { success: false, error: "Invalid password" }
});

await submit("  wrong\t");

assert("401 renders the server error verbatim", elements.loginError.textContent === "Invalid password");

assert("overlay still visible after failed login", !hasClass(elements.loginOverlay, "hidden"));

assert("logout button still hidden after failed login", hasClass(elements.logoutBtn, "hidden"));


/* Scenario 2: genuine 200 {"success":true}. Never an error.
   Also proves surrounding whitespace is trimmed before sending. */

elements.loginError.textContent = "stale";

loginResponses.push({
    status: 200,
    body: { success: true }
});

await submit("  the-real-token\n");

assert("200 success does NOT show Invalid password", elements.loginError.textContent !== "Invalid password");

assert("error text cleared on success", elements.loginError.textContent === "");

assert("password field cleared on success", elements.loginPassword.value === "");

assert("overlay hidden after success", hasClass(elements.loginOverlay, "hidden"));

assert("logout button visible after success", !hasClass(elements.logoutBtn, "hidden"));

const loginCalls = fetchCalls.filter(c => c.url === "/api/login");

const loginCall = loginCalls[loginCalls.length - 1];

assert("login request was POST /api/login", Boolean(loginCall) && loginCall.opts.method === "POST");

assert("password trimmed before sending", loginCall && JSON.parse(loginCall.opts.body).password === "the-real-token");

assert("login request did not override credentials (cookie sent same-origin by default)",
    loginCall && loginCall.opts.credentials === undefined);


/* Scenario 3: network failure -> generic message, not the server text. */

loginResponses.push({ throws: true });

await submit("any-value");

assert("network failure shows generic message", elements.loginError.textContent === "Login failed. Check your connection.");


/* Summary. */

if (failed.length) {

    console.error(`Auth Frontend: ${failed.length} FAILED`);

    process.exit(1);

}

console.log(`Auth Frontend: all ${passed.length} assertions passed.`);