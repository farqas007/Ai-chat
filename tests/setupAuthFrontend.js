/* ===========================================================
   Test shim: import BEFORE js/auth.js.
   auth.js reads document.getElementById at module evaluation,
   so the element stubs must exist first.
=========================================================== */


globalThis.window = globalThis;


function makeEl() {

    const classes = new Set();

    return {
        classList: {
            add: c => classes.add(c),
            remove: c => classes.delete(c),
            contains: c => classes.has(c)
        },
        addEventListener(type, fn) {
            this._handlers = this._handlers || {};
            (this._handlers[type] = this._handlers[type] || []).push(fn);
        },
        _handlers: {}
    };

}


export const elements = {};


export function initElements() {
    elements.loginOverlay = makeEl();
    elements.loginForm = makeEl();
    elements.loginPassword = Object.assign(makeEl(), { value: "" });
    elements.loginError = Object.assign(makeEl(), { textContent: "" });
    elements.logoutBtn = makeEl();
}


initElements();


globalThis.document = {
    getElementById: id => elements[id] || null
};


export const fetchCalls = [];

export const loginResponses = [];

export let sessionResponse = { ok: true, status: 200, json: async () => ({ authenticated: false }) };

export function setSessionResponse(resp) {
    sessionResponse = resp;
}


export function setFetchHandler() {

    globalThis.fetch = async (url, opts) => {

        fetchCalls.push({ url, opts });

        if (url === "/api/login") {

            const r = loginResponses.shift();

            if (!r) {
                throw new Error("no login response queued");
            }

            if (r.throws) {
                throw new Error("network");
            }

            return {
                ok: r.status >= 200 && r.status < 300,
                status: r.status,
                json: async () => r.body
            };

        }

        if (url === "/api/session") {
            return sessionResponse;
        }

        throw new Error("unexpected fetch url: " + url);

    };

}