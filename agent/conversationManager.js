import { SessionManager } from "../core/sessionManager.js";

export class ConversationManager {

    constructor() {

        this.sessions = new SessionManager();

        this.current = null;

    }

    newChat(title = "New Chat") {

        this.current = this.sessions.create(title);

        return this.current;

    }

    open(id) {

        this.current = this.sessions.load(id);

        return this.current;

    }

    save() {

        if (!this.current) {

            return false;

        }

        this.sessions.save(this.current);

        return true;

    }

    addMessage(role, content) {

        if (!this.current) {

            this.newChat();

        }

        this.current.messages.push({

            role,

            content,

            timestamp: Date.now()

        });

        this.save();

    }

    getMessages() {

        if (!this.current) {

            return [];

        }

        return this.current.messages;

    }

    lastMessage() {

        if (!this.current) {

            return null;

        }

        return this.current.messages.at(-1);

    }

    clearMessages() {

        if (!this.current) {

            return;

        }

        this.current.messages = [];

        this.save();

    }

    rename(title) {

        if (!this.current) {

            return;

        }

        this.current.title = title;

        this.save();

    }

    currentSession() {

        return this.current;

    }

}