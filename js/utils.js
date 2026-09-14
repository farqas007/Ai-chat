/* ===========================================================
   AI CHAT
   File : utils.js
   Description : Global Utility Functions
=========================================================== */


/* ===========================================================
   DOM HELPERS
=========================================================== */

export function $(selector, parent = document) {

    return parent.querySelector(selector);

}

export function $$(selector, parent = document) {

    return [...parent.querySelectorAll(selector)];

}


/* ===========================================================
   ELEMENT CREATOR
=========================================================== */

export function createElement(tag, className = "", text = "") {

    const element = document.createElement(tag);

    if (className) {

        element.className = className;

    }

    if (text) {

        element.textContent = text;

    }

    return element;

}


/* ===========================================================
   UNIQUE ID
=========================================================== */

export function generateId(prefix = "id") {

    return `${prefix}_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;

}


/* ===========================================================
   DATE & TIME
=========================================================== */

export function formatTime(date = new Date()) {

    return new Intl.DateTimeFormat("en-US", {

        hour: "2-digit",

        minute: "2-digit"

    }).format(date);

}


/* ===========================================================
   LOCAL STORAGE
=========================================================== */

export function save(key, value) {

    localStorage.setItem(

        key,

        JSON.stringify(value)

    );

}

export function load(key, defaultValue = null) {

    const value = localStorage.getItem(key);

    if (!value) {

        return defaultValue;

    }

    try {

        return JSON.parse(value);

    } catch {

        return defaultValue;

    }

}


/* ===========================================================
   CLASS HELPERS
=========================================================== */

export function addClass(element, className) {

    element.classList.add(className);

}

export function removeClass(element, className) {

    element.classList.remove(className);

}

export function toggleClass(element, className) {

    element.classList.toggle(className);

}


/* ===========================================================
   SCROLL
=========================================================== */

export function scrollToBottom(element) {

    element.scrollTop = element.scrollHeight;

}


/* ===========================================================
   DEBOUNCE
=========================================================== */

export function debounce(callback, delay = 300) {

    let timer;

    return (...args) => {

        clearTimeout(timer);

        timer = setTimeout(() => {

            callback(...args);

        }, delay);

    };

}


/* ===========================================================
   COPY
=========================================================== */

export async function copy(text) {

    try {

        await navigator.clipboard.writeText(text);

        return true;

    } catch {

        return false;

    }

}


/* ===========================================================
   SLEEP
=========================================================== */

export function sleep(ms) {

    return new Promise(resolve => {

        setTimeout(resolve, ms);

    });

}


/* ===========================================================
   RANDOM
=========================================================== */

export function random(min, max) {

    return Math.floor(

        Math.random() * (max - min + 1)

    ) + min;

}


/* ===========================================================
   CLAMP
=========================================================== */

export function clamp(value, min, max) {

    return Math.min(

        Math.max(value, min),

        max

    );

}


/* ===========================================================
   EMPTY CHECK
=========================================================== */

export function isEmpty(value) {

    return value.trim() === "";

}


/* ===========================================================
   LOGGER
=========================================================== */

export const Logger = {

    log(...args) {

        console.log("[AI CHAT]", ...args);

    },

    warn(...args) {

        console.warn("[AI CHAT]", ...args);

    },

    error(...args) {

        console.error("[AI CHAT]", ...args);

    }

};