import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export class MemoryManager {

    constructor(file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "memory.json")) {

        this.file = file;

        if (!fs.existsSync(this.file)) {

            fs.writeFileSync(
                this.file,
                JSON.stringify({
                    history: []
                }, null, 2)
            );

        }

    }

    load() {

        try {

            return JSON.parse(
                fs.readFileSync(this.file, "utf8")
            );

        }

        catch {

            return {
                history: []
            };

        }

    }

    save(data) {

        fs.writeFileSync(
            this.file,
            JSON.stringify(data, null, 2)
        );

    }

    add(entry) {

        const memory = this.load();

        memory.history.push({

            time: new Date().toISOString(),

            ...entry

        });

        this.save(memory);

    }

    clear() {

        this.save({

            history: []

        });

    }

}