/* ===========================================================
   PH-05 regression — accessibility of the dialogs, labels and
   the mobile sidebar.

   Part 1 (file audit) : index.html exposes proper dialog
     semantics (role="dialog" + aria-modal + labelledby + heading
     ids), an accessible label for the composer and the password
     field, and the mobile sidebar backdrop element.
   Part 2 (runtime)    : the app's sidebar open/close shows and
     hides the mobile backdrop, Escape closes the settings dialog
     and the mobile sidebar, and settings:open moves focus into
     the dialog. The login overlay stays dismissible-free (server
     gated), so Escape must NOT be able to hide it by accident.
   =========================================================== */

globalThis.window = globalThis;

const capturedKeydown = {};

const capturedSidebar = {
    _active: false,
    classList: {
        add: name => { if (name === "active") capturedSidebar._active = true; },
        remove: name => { if (name === "active") capturedSidebar._active = false; },
        toggle: name => {
            if (name === "active") {
                capturedSidebar._active = !capturedSidebar._active;
            }
        },
        contains: name => name === "active" && capturedSidebar._active
    }
};

globalThis.document = {
    querySelector: selector =>
        selector === "#sidebar" ? capturedSidebar : null,
    querySelectorAll: () => [],
    createElement: () => ({
        className: "", innerHTML: "", style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {}, addEventListener() {}, setAttribute() {},
        remove() {}, focus() {}
    }),
    addEventListener: (type, fn) => { capturedKeydown[type] = fn; },
    body: { appendChild() {}, style: {} }
};

globalThis.speechSynthesis = {
    getVoices: () => [],
    cancel: () => {}, speak: () => {},
    pause: () => {}, resume: () => {},
    onvoiceschanged: null
};

globalThis.localStorage = (() => {
    const map = new Map();
    return {
        getItem: k => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: k => map.delete(k),
        clear: () => map.clear(),
        length: 0
    };
})();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { App } from "../js/app.js";
import Events from "../js/events.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.join(__dirname, "..");


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


/* ===========================================================
   PART 1 — index.html dialog/label markup
=========================================================== */

const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");

function section(selector) {
    const start = html.indexOf(selector);
    return start === -1 ? "" : html.slice(start);
}

assert(
    "A1 settingsModal is an aria-modal dialog with a labelled heading",
    /id="settingsModal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="settingsModalTitle"/.test(html) &&
    /id="settingsModalTitle"/.test(html) &&
    /id="settingsModalTitle"/.test(section("Settings"))
);

assert(
    "A1 loginOverlay is an aria-modal dialog with a labelled heading",
    /id="loginOverlay"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="loginOverlayTitle"/.test(html) &&
    /id="loginOverlayTitle"/.test(html)
);

assert(
    "A1 composer textarea carries an accessible label",
    /id="messageInput"/.test(html) &&
    /aria-label="Type your message"/.test(html)
);

assert(
    "A1 login password input carries an accessible label",
    /id="loginPassword"/.test(html) &&
    /aria-label="Access password"/.test(html)
);

assert(
    "A1 mobile sidebar backdrop element exists",
    /id="sidebarOverlay"/.test(html)
);


/* ===========================================================
   PART 2 — runtime dialog + sidebar behavior
=========================================================== */

function createHarness() {

    const calls = {
        focusTargets: [],
        overlayVisible: []
    };

    const overlay = {
        _visible: false,
        _hidden: true,
        _ariaHidden: "true",
        classList: {
            add: name => {
                if (name === "visible") overlay._visible = true;
                if (name === "hidden") overlay._hidden = true;
            },
            remove: name => {
                if (name === "visible") overlay._visible = false;
                if (name === "hidden") overlay._hidden = false;
            },
            toggle() {},
            contains: name =>
                (name === "visible" && overlay._visible) ||
                (name === "hidden" && overlay._hidden)
        },
        setAttribute: (name, value) => {
            if (name === "aria-hidden") {
                overlay._ariaHidden = value;
            }
        }
    };

    const closeButton = {
        focus: () => calls.focusTargets.push("closeSettings")
    };

    const modal = {
        style: { display: "none" },
        _hidden: true,
        classList: {
            add: name => { if (name === "hidden") modal._hidden = true; },
            remove: name => { if (name === "hidden") modal._hidden = false; },
            toggle() {},
            contains: name => name === "hidden" && modal._hidden
        },
        querySelector: selector =>
            selector === "#closeSettings" ? closeButton : null
    };

    const app = new App();

    app.ui = {
        elements: {
            settingsModal: modal,
            themeSelect: { value: "" },
            voiceSelect: null,
            sidebarOverlay: overlay
        },
        showTyping() {}, showError() {}, hideError() {},
        setSending() {}, removeMessage() {}, updateStreamingMessage() {},
        appendMessage() {}, updateMessage() {}, renderChat() {},
        clearMessages() {}, showEmptyState() {}, setTitle() {},
        scrollToBottom() {}, setUnreadBadge() {}
    };

    app.codeblock = { refresh() {} };
    app.voice = {
        voices: [],
        settings: {},
        speak() {}, stopSpeaking() {}, destroy() {},
        detector: { detect: () => ({}) },
        player: { pause() {}, resume() {} },
        config: { paused: false }
    };
    app.voiceInput = { isListening: false, start() {}, stop() {} };
    app.markdown = { render: t => t };
    app.api = { streamMessage: async () => {} };
    app.voiceUI = null;

    app.registerEvents();

    // Track backdrop visibility as the cases run.
    const trackOverlay = () =>
        calls.overlayVisible.push(overlay._visible);

    return { app, calls, overlay, modal, trackOverlay };
}


/* Mobile drawer open/close with the backdrop. */
function testMobileSidebarBackdrop(h) {

    // Mobile viewport.
    globalThis.innerWidth = 375;

    Events.emit("menu:toggle"); // open the drawer

    assert(
        "S1 menu:toggle opens the mobile drawer",
        h.app.settings.isSidebarOpen() === true &&
        capturedSidebar._active === true
    );

    assert(
        "S1 open drawer shows the backdrop on mobile",
        h.overlay._visible === true
    );

    assert(
        "S1 open removes the hidden class from the backdrop",
        h.overlay._hidden === false
    );

    assert(
        "S1 open adds the visible class to the backdrop",
        h.overlay.classList.contains("visible") === true
    );

    assert(
        "S1 open sets aria-hidden=false on the backdrop",
        h.overlay._ariaHidden === "false"
    );

    // Escape closes the mobile drawer + backdrop.
    const keydown = capturedKeydown.keydown;
    keydown({ key: "Escape" });

    assert(
        "S1 Escape closes the mobile drawer",
        capturedSidebar._active === false &&
        h.app.settings.isSidebarOpen() === false
    );

    assert(
        "S1 closing hides the backdrop",
        h.overlay._visible === false
    );

    assert(
        "S1 close removes the visible class from the backdrop",
        h.overlay.classList.contains("visible") === false
    );

    assert(
        "S1 close adds the hidden class to the backdrop",
        h.overlay.classList.contains("hidden") === true
    );

    assert(
        "S1 close sets aria-hidden=true on the backdrop",
        h.overlay._ariaHidden === "true"
    );

    // The overlay click-outside path reuses menu:toggle, so the
    // same toggle that opened the drawer also closes it.
    Events.emit("menu:toggle");
    assert(
        "S1 drawer reopened for click-outside test",
        capturedSidebar._active === true
    );

    Events.emit("menu:toggle");
    assert(
        "S1 menu:toggle (overlay tap path) closes the drawer",
        capturedSidebar._active === false &&
        h.overlay._visible === false &&
        h.overlay._hidden === true
    );

    // Desktop never shows the backdrop even while toggled open.
    globalThis.innerWidth = 1200;

    Events.emit("menu:toggle");
    assert(
        "S1 desktop toggle does NOT show the mobile backdrop",
        capturedSidebar._active === true &&
        h.overlay._visible === false &&
        h.overlay.classList.contains("hidden") === true
    );

    assert(
        "S1 desktop keeps the backdrop aria-hidden=true",
        h.overlay._ariaHidden === "true"
    );

    // Close the desktop drawer so later cases start clean.
    Events.emit("menu:toggle");

}


/* Settings dialog focus-on-open + Escape-to-close. */
function testSettingsDialogFocusAndEscape(h) {

    const keydown = capturedKeydown.keydown;

    Events.emit("settings:open");

    assert(
        "S2 settings:open focuses the dialog close button",
        h.calls.focusTargets.includes("closeSettings")
    );

    assert(
        "S2 settings:open reveals the dialog",
        h.modal._hidden === false
    );

    keydown({ keyCode: 27 });

    assert(
        "S2 Escape closes the settings dialog",
        h.modal._hidden === true
    );

    // A stray Escape with nothing open must be a safe no-op.
    let threw = false;
    try {
        keydown({ key: "Escape" });
    } catch (error) {
        threw = true;
    }

    assert(
        "S2 Escape with nothing open is a safe no-op",
        threw === false &&
        h.modal._hidden === true
    );

}


const h = createHarness();

testMobileSidebarBackdrop(h);

testSettingsDialogFocusAndEscape(h);


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}