import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export class MemoryManager {

    constructor(file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "memory.json")) {

        this.file = file;

        this._preservedCorrupt = false;

        if (!fs.existsSync(this.file)) {

            this.save({ history: [] });

        }

    }

    // A corrupt or structurally invalid memory file must never be silently
    // overwritten with an empty history: the raw bytes are copied to a
    // timestamped .corrupt backup once, then a clean state is returned.
    _preserveIfCorrupt() {

        if (this._preservedCorrupt || !fs.existsSync(this.file)) {
            return;
        }

        let data;

        try {
            data = JSON.parse(fs.readFileSync(this.file, "utf8"));
        } catch {
            data = null;
        }

        const valid =
            data &&
            typeof data === "object" &&
            !Array.isArray(data) &&
            Array.isArray(data.history);

        if (valid) {
            return;
        }

        this._preservedCorrupt = true;

        try {
            fs.copyFileSync(
                this.file,
                `${this.file}.corrupt-${Date.now()}.bak`
            );
        } catch {
            // Backing up must never break loading.
        }

    }

    _atomicWrite(data) {

        const temp = `${this.file}.tmp`;

        fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");

        fs.renameSync(temp, this.file);

    }

    load() {

        this._preserveIfCorrupt();

        try {

            const data = JSON.parse(
                fs.readFileSync(this.file, "utf8")
            );

            if (
                data &&
                typeof data === "object" &&
                !Array.isArray(data) &&
                Array.isArray(data.history)
            ) {
                return data;
            }

        } catch {
            // fall through to a clean state
        }

        return { history: [] };

    }

    save(data) {

        this._atomicWrite(data);

    }

    add(entry) {

        const memory = this.load();

        if (!Array.isArray(memory.history)) {

            memory.history = [];

        }

        memory.history.push({

            time: new Date().toISOString(),

            ...entry

        });

        this.save(memory);

    }

    clear() {

        this.save({ history: [] });

    }

}