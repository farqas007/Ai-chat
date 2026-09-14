import fs from "fs";
import crypto from "crypto";

export class SessionManager {

    constructor(directory = "./sessions") {

        this.directory = directory;

        if (!fs.existsSync(directory)) {

            fs.mkdirSync(directory);

        }

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

        fs.writeFileSync(

            `${this.directory}/${id}.json`,

            JSON.stringify(session, null, 2)

        );

        return session;

    }

    load(id) {

        return JSON.parse(

            fs.readFileSync(

                `${this.directory}/${id}.json`,

                "utf8"

            )

        );

    }

    save(session) {

        session.updated = Date.now();

        fs.writeFileSync(

            `${this.directory}/${session.id}.json`,

            JSON.stringify(session, null, 2)

        );

    }

    list() {

        return fs.readdirSync(this.directory)

            .filter(file => file.endsWith(".json"))

            .map(file => {

                const session = JSON.parse(

                    fs.readFileSync(

                        `${this.directory}/${file}`,

                        "utf8"

                    )

                );

                return {

                    id: session.id,

                    title: session.title,

                    updated: session.updated

                };

            });

    }

    delete(id) {

        fs.unlinkSync(

            `${this.directory}/${id}.json`

        );

    }

}