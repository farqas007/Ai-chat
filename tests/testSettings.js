/* ===========================================================
   F6 — Settings manager tests (js/settings.js).

   js/settings.js was previously covered only implicitly (other
   modules call app.settings.set/get). This file tests the real
   Settings class directly:

   - defaults when storage is empty or missing
   - persistence across instances (set -> save -> reload)
   - load() re-merges after external storage changes
   - reset() restores defaults and persists them
   - getAll() returns a detached copy
   - corrupted/invalid stored JSON degrades to defaults (no crash)
   - applyTheme() maps only "light" to the body light class and
     treats any other value (including garbage) as dark
   - toggleTheme() round-trips dark<->light, persists and applies
   - setSidebar()/isSidebarOpen() persist
   - safe when localStorage is missing entirely (storage.read and
     storage.write swallow the environment failure)
   - safe when localStorage.setItem throws (write returns failure,
     in-memory settings still work)

   localStorage and document are stubbed; globals are restored
   after tests. No real browser storage, no artifacts.
=========================================================== */

import assert from "node:assert";

import { Settings } from "../js/settings.js";

import { STORAGE_KEYS } from "../js/storage.js";


function makeLocalStorage(map) {
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key),
        clear: () => map.clear(),
        count: () => map.size
    };
}

let storageMap = new Map();

let localStorageStub = makeLocalStorage(storageMap);

const bodyCalls = { add: [], remove: [] };

globalThis.localStorage = localStorageStub;

globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
        className: "", innerHTML: "", style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {}, addEventListener() {},
        setAttribute() {}, remove() {}, focus() {},
        querySelector: () => null
    }),
    addEventListener() {},
    body: {
        style: {},
        classList: {
            add: name => bodyCalls.add.push(name),
            remove: name => bodyCalls.remove.push(name)
        }
    }
};


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

function freshEnv() {
    storageMap = new Map();
    localStorageStub = makeLocalStorage(storageMap);
    globalThis.localStorage = localStorageStub;
    bodyCalls.add = [];
    bodyCalls.remove = [];
}


/* -----------------------------------------------------------
   Defaults + key access
----------------------------------------------------------- */

function testDefaultsAndAccessors() {
    freshEnv();

    const settings = new Settings();

    assert.strictEqual(settings.get("theme"), "dark", "default theme is dark");
    assert.strictEqual(settings.get("language"), "en", "default language is en");
    assert.strictEqual(settings.get("sidebarOpen"), true, "default sidebarOpen is true");
    assert.strictEqual(settings.get("fontSize"), "medium", "default fontSize is medium");
    assert.strictEqual(settings.get("animations"), true, "default animations is true");
    assert.strictEqual(settings.get("sound"), false, "default sound is false");
    assert.strictEqual(settings.get("autoScroll"), true, "default autoScroll is true");
    assert.strictEqual(settings.get("sendWithEnter"), true, "default sendWithEnter is true");
    assert.strictEqual(settings.get("developerMode"), false, "default developerMode is false");

    const all = settings.getAll();

    assert.deepStrictEqual(all, {
        theme: "dark",
        language: "en",
        sidebarOpen: true,
        fontSize: "medium",
        animations: true,
        sound: false,
        autoScroll: true,
        sendWithEnter: true,
        developerMode: false
    }, "getAll() exposes the full merged settings");

    assert.strictEqual(all.sidebar, undefined, "no phantom sidebar key remains");

    check("S defaults on empty storage", true);

    all.theme = "hacked";
    assert.strictEqual(
        settings.get("theme"),
        "dark",
        "getAll() returns a detached copy (mutation does not leak)"
    );

    check("S getAll() is a detached copy", true);
}


/* -----------------------------------------------------------
   Persistence across instances
----------------------------------------------------------- */

function testPersistence() {
    freshEnv();

    const settings = new Settings();

    settings.set("theme", "light");
    settings.set("sound", true);
    settings.set("sidebarOpen", false);

    assert.strictEqual(
        storageMap.get(STORAGE_KEYS.SETTINGS),
        JSON.stringify(settings.getAll()),
        "set() persists immediately to the canonical settings key"
    );

    check("S set() persists under STORAGE_KEYS.SETTINGS", true);

    const reloaded = new Settings();

    assert.strictEqual(reloaded.get("theme"), "light", "reloaded theme");
    assert.strictEqual(reloaded.get("sound"), true, "reloaded sound");
    assert.strictEqual(reloaded.get("sidebarOpen"), false, "reloaded sidebarOpen");

    check("S new Settings() reloads persisted values", true);
}


/* -----------------------------------------------------------
   load() re-merges after external changes
----------------------------------------------------------- */

function testLoadReMerge() {
    freshEnv();

    const settings = new Settings();

    settings.set("theme", "light");

    const external = new Settings();
    external.set("theme", "dark");
    external.set("fontSize", "large");

    settings.load();

    assert.strictEqual(settings.get("theme"), "dark", "load() picks up external theme change");
    assert.strictEqual(settings.get("fontSize"), "large", "load() picks up external fontSize change");
    assert.strictEqual(settings.get("sound"), false, "absent keys fall back to defaults after load()");

    check("S load() re-merges persisted state over defaults", true);
}


/* -----------------------------------------------------------
   reset()
----------------------------------------------------------- */

function testReset() {
    freshEnv();

    const settings = new Settings();

    settings.set("theme", "light");
    settings.set("sound", true);
    settings.reset();

    assert.strictEqual(settings.get("theme"), "dark", "reset() restores default theme");
    assert.strictEqual(settings.get("sound"), false, "reset() restores default sound");

    const reloaded = new Settings();

    assert.strictEqual(reloaded.get("theme"), "dark", "reset() persisted");

    check("S reset() restores and persists defaults", true);
}


/* -----------------------------------------------------------
   Corrupted stored JSON degrades safely
----------------------------------------------------------- */

function testCorruptedStoredJson() {
    freshEnv();

    storageMap.set(STORAGE_KEYS.SETTINGS, "{not valid json!!");

    const settings = new Settings();

    assert.strictEqual(settings.get("theme"), "dark", "corrupted JSON yields defaults (theme)");
    assert.strictEqual(settings.get("sound"), false, "corrupted JSON yields defaults (sound)");
    assert.strictEqual(settings.get("sidebarOpen"), true, "corrupted JSON yields defaults (sidebarOpen)");

    check("S corrupted stored JSON degrades to defaults", true);

    // A structurally-valid but minimal object keeps safe defaults too.
    freshEnv();

    storageMap.set(STORAGE_KEYS.SETTINGS, JSON.stringify({ theme: "light" }));

    const partial = new Settings();

    assert.strictEqual(partial.get("theme"), "light", "partial stored settings merge over defaults");
    assert.strictEqual(partial.get("sound"), false, "missing keys stay at defaults");

    check("S partial stored settings merge safely over defaults", true);
}


/* -----------------------------------------------------------
   applyTheme()
----------------------------------------------------------- */

function testApplyTheme() {
    freshEnv();

    const settings = new Settings();

    settings.applyTheme();
    assert.deepStrictEqual(bodyCalls.add, [], "dark theme adds no light class");
    assert.deepStrictEqual(bodyCalls.remove, ["light"], "dark theme removes the light class");

    check("S applyTheme() dark -> no light class on body", true);

    settings.set("theme", "light");
    bodyCalls.add = [];
    settings.applyTheme();
    assert.deepStrictEqual(bodyCalls.add, ["light"], "light theme adds the light class");

    check("S applyTheme() light -> light class added to body", true);

    // Invalid stored value must render as dark, never crash.
    settings.set("theme", "purple");
    bodyCalls.add = [];
    bodyCalls.remove = [];
    settings.applyTheme();
    assert.deepStrictEqual(bodyCalls.add, [], "invalid theme adds no light class");
    assert.deepStrictEqual(bodyCalls.remove, ["light"], "invalid theme removes light class");

    check("S applyTheme() invalid theme is treated as dark", true);
}


/* -----------------------------------------------------------
   toggleTheme()
----------------------------------------------------------- */

function testToggleTheme() {
    freshEnv();

    const settings = new Settings();

    assert.strictEqual(settings.get("theme"), "dark");

    settings.toggleTheme();
    assert.strictEqual(settings.get("theme"), "light", "toggle dark -> light");
    assert.deepStrictEqual(bodyCalls.add, ["light"], "toggle applies light class");
    assert.strictEqual(
        JSON.parse(storageMap.get(STORAGE_KEYS.SETTINGS)).theme,
        "light",
        "toggle persists the new theme"
    );

    check("S toggleTheme() dark -> light, applied and persisted", true);

    settings.toggleTheme();
    assert.strictEqual(settings.get("theme"), "dark", "toggle light -> dark");
    assert.deepStrictEqual(bodyCalls.remove, ["light"], "second toggle removes light class");
    assert.strictEqual(
        JSON.parse(storageMap.get(STORAGE_KEYS.SETTINGS)).theme,
        "dark",
        "second toggle persists dark"
    );

    check("S toggleTheme() light -> dark, applied and persisted", true);

    // Invalid stored theme self-heals on a single toggle.
    freshEnv();

    storageMap.set(STORAGE_KEYS.SETTINGS, JSON.stringify({ theme: "purple" }));

    const weird = new Settings();

    weird.toggleTheme();
    assert.strictEqual(weird.get("theme"), "dark", "invalid theme toggles to dark (self-heal)");

    check("S toggleTheme() self-heals an invalid stored theme", true);
}


/* -----------------------------------------------------------
   Sidebar flag
----------------------------------------------------------- */

function testSidebarFlag() {
    freshEnv();

    const settings = new Settings();

    assert.strictEqual(settings.isSidebarOpen(), true, "sidebar open by default");

    settings.setSidebar(false);
    assert.strictEqual(settings.isSidebarOpen(), false, "setSidebar(false) reflected");

    const persisted = JSON.parse(storageMap.get(STORAGE_KEYS.SETTINGS));
    assert.strictEqual(persisted.sidebarOpen, false, "persisted JSON stores sidebarOpen");
    assert.strictEqual(persisted.sidebar, undefined, "persisted JSON has no phantom sidebar key");

    const reloaded = new Settings();
    assert.strictEqual(reloaded.isSidebarOpen(), false, "setSidebar persists");
    assert.strictEqual(reloaded.get("sidebar"), undefined, "reloaded settings lack phantom sidebar key");

    check("S setSidebar()/isSidebarOpen() round-trips and persists", true);
}


/* -----------------------------------------------------------
   Missing localStorage (storage guards its own failures)
----------------------------------------------------------- */

function testMissingLocalStorage() {
    freshEnv();

    const savedLocalStorage = globalThis.localStorage;

    delete globalThis.localStorage;

    try {
        // Constructor must not throw when localStorage is absent.
        const settings = new Settings();

        assert.strictEqual(settings.get("theme"), "dark", "defaults used with no localStorage");

        // get()/applyTheme()/toggleTheme()/save() must all stay safe.
        settings.applyTheme();
        settings.toggleTheme();
        settings.set("sound", true);
        settings.reset();

        assert.strictEqual(settings.get("theme"), "dark", "reset works without localStorage");

        check("S settings survive a missing localStorage", true);
    } finally {
        globalThis.localStorage = savedLocalStorage;
    }
}


/* -----------------------------------------------------------
   localStorage.setItem throws (quota/privacy mode)
----------------------------------------------------------- */

function testWriteFailure() {
    freshEnv();

    const originalSetItem = localStorageStub.setItem;

    localStorageStub.setItem = () => {
        throw new Error("QuotaExceededError");
    };

    try {
        const settings = new Settings();

        settings.set("theme", "light");

        assert.strictEqual(settings.get("theme"), "light", "in-memory value survives a write failure");

        assert.doesNotThrow(() => settings.toggleTheme(), "toggleTheme does not throw on write failure");
        assert.strictEqual(settings.get("theme"), "dark", "toggle still updates in-memory state");

        check("S write failure never breaks in-memory settings", true);
    } finally {
        localStorageStub.setItem = originalSetItem;
    }
}


testDefaultsAndAccessors();
testPersistence();
testLoadReMerge();
testReset();
testCorruptedStoredJson();
testApplyTheme();
testToggleTheme();
testSidebarFlag();
testMissingLocalStorage();
testWriteFailure();


console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}