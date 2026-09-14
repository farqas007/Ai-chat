/* ===========================================================
   AI CHAT
   File : settings.js
   Description : Application Settings Manager
=========================================================== */

import { Storage } from "./storage.js";

/* ===========================================================
   DEFAULT SETTINGS
=========================================================== */

const DEFAULT_SETTINGS = {

    theme: "dark",

    language: "en",

    sidebarOpen: true,

    fontSize: "medium",

    animations: true,

    sound: false,

    autoScroll: true,

    sendWithEnter: true,

    developerMode: false

};

/* ===========================================================
   SETTINGS
=========================================================== */

export class Settings {

    constructor() {

        this.storage = new Storage();

        this.settings = {

            ...DEFAULT_SETTINGS,

            ...this.storage.getSettings()

        };

    }

    /* =======================================================
       LOAD
    ======================================================= */

    load() {

        this.settings = {

            ...DEFAULT_SETTINGS,

            ...this.storage.getSettings()

        };

        return this.settings;

    }

    /* =======================================================
       SAVE
    ======================================================= */

    save() {

        this.storage.saveSettings(this.settings);

    }

    /* =======================================================
       GET
    ======================================================= */

    get(key) {

        return this.settings[key];

    }

    /* =======================================================
       SET
    ======================================================= */

    set(key, value) {

        this.settings[key] = value;

        this.save();

    }

    /* =======================================================
       GET ALL
    ======================================================= */

    getAll() {

        return {

            ...this.settings

        };

    }

    /* =======================================================
       RESET
    ======================================================= */

    reset() {

        this.settings = {

            ...DEFAULT_SETTINGS

        };

        this.save();

    }

    /* =======================================================
       THEME
    ======================================================= */

    applyTheme() {

        if (this.settings.theme === "light") {

            document.body.classList.add("light");

        } else {

            document.body.classList.remove("light");

        }

    }

    toggleTheme() {

        this.settings.theme =

            this.settings.theme === "dark"

                ? "light"

                : "dark";

        this.save();

        this.applyTheme();

    }

    /* =======================================================
       SIDEBAR
    ======================================================= */

    setSidebar(open) {

        this.settings.sidebarOpen = open;

        this.save();

    }

    isSidebarOpen() {

        return this.settings.sidebarOpen;

    }

}