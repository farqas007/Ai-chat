/* ===========================================================
   AI CHAT
   File : storage.js
   Description : Local Storage Manager
=========================================================== */

/* Single canonical source for every storage key so no module
   can drift onto a second, silently-invisible key. */
export const STORAGE_KEYS = {

    CHATS: "ai_chat_chats",

    CURRENT_CHAT: "ai_chat_current_chat",

    SETTINGS: "ai_chat_settings",

    VOICE_SETTINGS: "voice-settings"

};

export class Storage {

    constructor() {

        this.keys = STORAGE_KEYS;

    }

    /* =======================================================
       PRIVATE
    ======================================================= */

    read(key, fallback = null) {

        try {

            const data = localStorage.getItem(key);

            return data ? JSON.parse(data) : fallback;

        } catch (error) {

            console.error("Storage Read Error:", error);

            return fallback;

        }

    }

    write(key, value) {

        try {

            localStorage.setItem(

                key,

                JSON.stringify(value)

            );

            return true;

        } catch (error) {

            console.error("Storage Write Error:", error);

            return false;

        }

    }

    /* =======================================================
       CHAT METHODS
    ======================================================= */

    getChats() {

        return this.read(this.keys.CHATS, []);

    }

    saveChats(chats) {

        return this.write(this.keys.CHATS, chats);

    }

    addChat(chat) {

        const chats = this.getChats();

        chats.unshift(chat);

        this.saveChats(chats);

        return chat;

    }

    updateChat(chatId, data) {

        const chats = this.getChats();

        const index = chats.findIndex(

            chat => chat.id === chatId

        );

        if (index === -1) return false;

        chats[index] = {

            ...chats[index],

            ...data

        };

        this.saveChats(chats);

        return true;

    }

    deleteChat(chatId) {

        const chats = this.getChats();

        const filtered = chats.filter(

            chat => chat.id !== chatId

        );

        this.saveChats(filtered);

    }

    getChat(chatId) {

        return this.getChats().find(

            chat => chat.id === chatId

        ) || null;

    }

    /* =======================================================
       CURRENT CHAT
    ======================================================= */

    setCurrentChat(chatId) {

        this.write(

            this.keys.CURRENT_CHAT,

            chatId

        );

    }

    getCurrentChat() {

        return this.read(

            this.keys.CURRENT_CHAT,

            null

        );

    }

    /* =======================================================
       SETTINGS
    ======================================================= */

    getSettings() {

        return this.read(

            this.keys.SETTINGS,

            {

                theme: "dark",

                language: "en",

                sidebar: true

            }

        );

    }

    saveSettings(settings) {

        return this.write(

            this.keys.SETTINGS,

            settings

        );

    }

    /* =======================================================
       RESET
    ======================================================= */

    clearChats() {

        localStorage.removeItem(

            this.keys.CHATS

        );

    }

    clearAll() {

        Object.values(this.keys).forEach(key => {

            localStorage.removeItem(key);

        });

    }

}