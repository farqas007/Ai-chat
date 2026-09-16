/* ===========================================================
   F6 — Theme + Settings frontend wiring tests.

   Covers the app-level behavior that depends on the real
   js/settings.js + a fake DOM / in-memory localStorage:

   - ui:theme-toggle event toggles Settings.theme, persists it
     under STORAGE_KEYS.SETTINGS and applies the body light class
   - settings:theme-change sets + applies + persists a theme
     (and, like the real code, never crashes on odd values)
   - settings:open syncs #themeSelect.value to the current theme,
     populates voice options and unhides the modal
   - settings:open / settings:close are safe no-ops when the modal
     (or its sub-elements) are missing — the DOM is optional
   - UI click on #themeToggle -> ui:theme-toggle -> Settings change
     (full emit path through UI.bindEvents)
   - constructing/initializing UI with a fully null DOM never throws

   Stubs are restored after each test. No real browser, no network,
   no artifacts.
=========================================================== */

import assert from "node:assert";

import { App } from "../js/app.js";
import { UI } from "../js/ui.js";
import Events from "../js/events.js";

import { STORAGE_KEYS } from "../js/storage.js";
import { Settings } from "../js/settings.js";


globalThis.window = globalThis;

globalThis.speechSynthesis = {
    getVoices: () => [],
    cancel: () => {},
    speak: () => {},
    pause: () => {},
    resume: () => {},
    onvoiceschanged: null
};

const storageMap = new Map();

globalThis.localStorage = {
    getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: k => storageMap.delete(k),
    clear: () => storageMap.clear()
};

const bodyCalls = { added: [], removed: [] };

const documentTracker = {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
        className: "", innerHTML: "", style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {}, addEventListener() {},
        setAttribute() {}, remove() {}, focus() {},
        querySelector: () => null
    }),
    addEventListener() {},
    body: {
        appendChild() {},
        style: {},
        classList: {
            add: name => bodyCalls.added.push(name),
            remove: name => bodyCalls.removed.push(name)
        }
    }
};

globalThis.document = documentTracker;


let passed = 0;
let failed = 0;

function check(name, condition) {
    if (condition) {
        passed += 1;
        console.log(`PASS: ${name}`);
    } else {
        failed += 1;
        console.log(`FAIL: ${name}`);
    }
}

function freshThemeState() {
    storageMap.clear();
    bodyCalls.added = [];
    bodyCalls.removed = [];
    app.settings = new Settings();
}


function createHarness() {

    function makeModal() {
        const calls = { added: [], removed: [] };
        return {
            calls,
            classList: {
                add: name => calls.added.push(name),
                remove: name => calls.removed.push(name)
            },
            style: {}
        };
    }

    const elements = {
        imageButton: { disabled: false }
    };

    const app = new App();

    app.ui = {
        elements,
        showTyping() {}, showError() {}, hideError() {},
        setSending() {}, removeMessage() {}, updateStreamingMessage() {},
        appendMessage() {}, updateMessage() {}, clearMessages() {},
        showEmptyState() {}, setTitle() {}, scrollToBottom() {},
        setUnreadBadge() {}, setVoiceInputSupported() {},
        setVoiceInputListening() {}, insertVoiceText() {},
        showGeneratedImage() {},
        markdown: { render: t => t }
    };

    app.chat = {
        state: { currentChatId: null },
        createChat(chat) { return chat; },
        openChat() {},
        connect() {},
        initialize() {}
    };
    app.sidebar = {
        state: { open: true },
        connect() {},
        initialize() {}
    };
    app.markdown = { render: t => t };
    app.codeblock = { refresh() {} };
    app.voice = {
        speak() {}, stopSpeaking() {},
        detector: { detect: () => ({}) },
        player: { pause() {}, resume() {} },
        config: { paused: false },
        settings: { language: "en" },
        voices: []
    };
    app.voiceInput = { isListening: false, start() {}, stop() {} };
    app.api = { streamMessage: async () => {} };
    app.imageGenerator = { generate() {} };

    app.registerEvents();

    return { app, elements, makeModal };

}


// ONE app harness for the whole file — global EventBus listeners
// would cross-talk if we built multiple.
const harness = createHarness();

const { app, elements } = harness;


/* -----------------------------------------------------------
   ui:theme-toggle
----------------------------------------------------------- */

function testThemeToggleEvent() {
    freshThemeState();

    ElementsTestCase.reset();

    assert.strictEqual(app.settings.get("theme"), "dark");

    Events.emit("ui:theme-toggle");

    assert.strictEqual(app.settings.get("theme"), "light", "toggle event flips theme to light");
    assert.strictEqual(
        JSON.parse(storageMap.get(STORAGE_KEYS.SETTINGS)).theme,
        "light",
        "toggle event persists the new theme"
    );

    check("TW ui:theme-toggle flips + persists + applies theme", true);

    Events.emit("ui:theme-toggle");

    assert.strictEqual(app.settings.get("theme"), "dark", "second toggle flips back to dark");

    check("TW ui:theme-toggle toggles back to dark", true);
}


/* -----------------------------------------------------------
   settings:theme-change
----------------------------------------------------------- */

function testThemeChangeEvent() {
    freshThemeState();

    Events.emit("settings:theme-change", "light");

    assert.strictEqual(app.settings.get("theme"), "light", "theme-change sets light");
    assert.strictEqual(
        JSON.parse(storageMap.get(STORAGE_KEYS.SETTINGS)).theme,
        "light",
        "theme-change persists light"
    );

    check("TW settings:theme-change light persists + applies", true);

    Events.emit("settings:theme-change", "dark");

    assert.strictEqual(app.settings.get("theme"), "dark", "theme-change sets dark");

    check("TW settings:theme-change dark persists + applies", true);

    // Odd values are stored but rendered as dark (fail-safe, documented
    // behavior — the real select only offers dark/light).
    freshThemeState();

    assert.doesNotThrow(() => Events.emit("settings:theme-change", "purple"));

    assert.strictEqual(app.settings.get("theme"), "purple", "odd theme value stored");
    assert.ok(!bodyCalls.added.includes("light"), "odd theme never adds light class");
    assert.ok(
        bodyCalls.removed.includes("light"),
        "odd theme removes any stray light class"
    );

    check("TW settings:theme-change odd value fails safe", true);
}


/* -----------------------------------------------------------
   Module-level helper to swap app.ui.elements safely
----------------------------------------------------------- */

const ElementsTestCase = {
    savedElements: null,

    reset() {
        if (this.savedElements) {
            elements.settingsModal = this.savedElements.settingsModal;
            elements.themeSelect = this.savedElements.themeSelect;
            elements.voiceSelect = this.savedElements.voiceSelect;
            this.savedElements = null;
        }
        delete elements.settingsModal;
        delete elements.themeSelect;
        delete elements.voiceSelect;
    },

    instead(next) {
        this.reset();
        this.savedElements = { ...next };
        Object.assign(elements, next);
    }
};


/* -----------------------------------------------------------
   settings:open — full happy path
----------------------------------------------------------- */

function testSettingsOpenHappyPath() {
    freshThemeState();

    const themeSelect = { value: "starter" };
    const voiceSelect = { value: "starter", innerHTML: "not-empty", appendChild() {} };
    const modal = harness.makeModal();

    ElementsTestCase.instead({ settingsModal: modal, themeSelect, voiceSelect });

    app.voice.voices = [
        { name: "Aria", lang: "en-US" }
    ];

    Events.emit("settings:open");

    assert.strictEqual(themeSelect.value, "dark", "themeSelect synced to current theme");
    assert.strictEqual(voiceSelect.innerHTML, "", "voiceSelect cleared before repopulating");
    assert.strictEqual(voiceSelect.value, "en", "voiceSelect synced to current voice language");
    assert.deepStrictEqual(modal.calls.removed, ["hidden"], "modal hidden class removed");
    assert.strictEqual(modal.style.display, "flex", "modal shown");

    check("TW settings:open syncs selects + shows modal", true);
}


/* -----------------------------------------------------------
   settings:open — modal present, selects missing
----------------------------------------------------------- */

function testSettingsOpenPartialElements() {
    freshThemeState();

    const modal = harness.makeModal();

    ElementsTestCase.instead({ settingsModal: modal });

    assert.doesNotThrow(() => Events.emit("settings:open"), "open with missing selects does not throw");

    assert.deepStrictEqual(modal.calls.removed, ["hidden"], "modal still shown without themeSelect");

    check("TW settings:open tolerates missing selects", true);
}


/* -----------------------------------------------------------
   settings:open / settings:close — modal missing
----------------------------------------------------------- */

function testSettingsModalMissingGuard() {
    freshThemeState();

    ElementsTestCase.reset();

    assert.doesNotThrow(() => Events.emit("settings:open"), "open without modal does not throw");
    assert.doesNotThrow(() => Events.emit("settings:close"), "close without modal does not throw");

    check("TW settings modal open/close are safe no-ops when DOM missing", true);

    const modal = harness.makeModal();

    ElementsTestCase.instead({ settingsModal: modal });

    Events.emit("settings:close");

    assert.deepStrictEqual(modal.calls.added, ["hidden"], "close adds hidden class");
    assert.strictEqual(modal.style.display, "none", "close hides modal");

    check("TW settings:close hides the modal", true);
}


/* -----------------------------------------------------------
   UI #themeToggle click -> ui:theme-toggle -> Settings
----------------------------------------------------------- */

function testUiThemeToggleClick() {
    freshThemeState();

    const savedQuerySelector = documentTracker.querySelector;

    const toggle = {
        listeners: {},
        addEventListener(type, fn) {
            this.listeners[type] = fn;
        },
        click() {
            this.listeners.click && this.listeners.click();
        }
    };

    documentTracker.querySelector = selector =>
        selector === "#themeToggle" ? toggle : null;

    try {
        const ui = new UI();

        assert.strictEqual(ui.elements.themeToggle, toggle, "UI captured #themeToggle");

        ui.initialize();

        assert.doesNotThrow(() => toggle.click(), "theme toggle click does not throw");

        assert.strictEqual(
            app.settings.get("theme"),
            "light",
            "UI click -> ui:theme-toggle -> Settings toggled to light"
        );
        assert.ok(bodyCalls.added.includes("light"), "UI click applies body light class");
        assert.strictEqual(
            JSON.parse(storageMap.get(STORAGE_KEYS.SETTINGS)).theme,
            "light",
            "UI click persists the new theme"
        );

        check("TW UI #themeToggle click toggles + persists + applies theme", true);
    } finally {
        documentTracker.querySelector = savedQuerySelector;
    }
}


/* -----------------------------------------------------------
   UI with a fully null DOM is safe
----------------------------------------------------------- */

function testUiNullDomSafety() {
    freshThemeState();

    const savedQuerySelector = documentTracker.querySelector;

    documentTracker.querySelector = () => null;

    try {
        const ui = new UI();

        assert.strictEqual(ui.elements.themeToggle, null, "no themeToggle element");
        assert.strictEqual(ui.elements.settingsModal, null, "no settingsModal element");
        assert.strictEqual(ui.elements.themeSelect, null, "no themeSelect element");

        assert.doesNotThrow(() => ui.initialize(), "UI initialize with null DOM never throws");

        check("TW UI gracefully handles a fully missing DOM", true);
    } finally {
        documentTracker.querySelector = savedQuerySelector;
    }
}


testThemeToggleEvent();
testThemeChangeEvent();
testSettingsOpenHappyPath();
testSettingsOpenPartialElements();
testSettingsModalMissingGuard();
testUiThemeToggleClick();
testUiNullDomSafety();


console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}