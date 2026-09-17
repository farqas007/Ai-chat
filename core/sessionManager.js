import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

export class SessionManager {

    constructor(directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "sessions")) {

        this.directory = directory;

        if (!fs.existsSync(directory)) {

            fs.mkdirSync(directory, { recursive: true });

        }

    }

    // Resolves a client-supplied session id to a file inside this.directory,
    // or returns null when the id could escape the directory (traversal,
    // backslashes, separators, NUL bytes, leading dots, oversized names).
    _fileFor(id) {

        if (
            typeof id !== "string" ||
            id.length === 0 ||
            id.length > 100 ||
            id.includes("/") ||
            id.includes("\\") ||
            id.includes("\0") ||
            id.includes("..") ||
            id.startsWith(".")
        ) {
            return null;
        }

        const base = path.resolve(this.directory);

        let full;

        try {
            full = path.resolve(base, `${id}.json`);
        } catch {
            return null;
        }

        const relative = path.relative(base, full);

        if (
            relative === "" ||
            relative.startsWith("..") ||
            path.isAbsolute(relative)
        ) {
            return null;
        }

        return full;
    }

    _atomicWrite(file, data) {

        const temp = `${file}.tmp`;

        fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");

        fs.renameSync(temp, file);

    }

    create(title = "New Chat") {

        const id = crypto.randomUUID();

        const session = {

            id,

            title,

            created: Date.now(),

            updated: Date.now(),

            messages: []

        };

        const file = this._fileFor(id);

        this._atomicWrite(file, session);

        return session;

    }

    load(id) {

        const file = this._fileFor(id);

        if (!file || !fs.existsSync(file)) {

            return null;

        }

        try {

            const session = JSON.parse(fs.readFileSync(file, "utf8"));

            if (
                !session ||
                typeof session !== "object" ||
                typeof session.id !== "string"
            ) {
                return null;
            }

            if (!Array.isArray(session.messages)) {
                session.messages = [];
            }

            if (typeof session.title !== "string") {
                session.title = "New Chat";
            }

            return session;

        } catch {
            return null;
        }

    }

    save(session) {

        if (
            !session ||
            typeof session !== "object" ||
            typeof session.id !== "string"
        ) {
            throw new Error("Invalid session");
        }

        const file = this._fileFor(session.id);

        if (!file) {

            throw new Error("Invalid session id");

        }

        session.updated = Date.now();

        this._atomicWrite(file, session);

    }

    list() {

        return fs.readdirSync(this.directory)

            .filter(file => file.endsWith(".json"))

            .map(file => {

                try {

                    const session = JSON.parse(

                        fs.readFileSync(path.join(this.directory, file), "utf8")

                    );

                    if (
                        session &&
                        typeof session === "object" &&
                        typeof session.id === "string"
                    ) {
                        return {

                            id: session.id,

                            title: typeof session.title === "string"
                                ? session.title
                                : "New Chat",

                            updated: Number.isFinite(session.updated)
                                ? session.updated
                                : 0

                        };
                    }

                } catch {
                    // Skip corrupt/unreadable session files instead of
                    // letting one bad file destroy the entire listing.
                }

                return null;

            })

            .filter(session => session !== null);

    }

    delete(id) {

        const file = this._fileFor(id);

        if (!file || !fs.existsSync(file)) {

            throw new Error("Invalid session id");

        }

        fs.unlinkSync(file);

    }

}