export class MemoryRetriever {

    constructor(limit = 8) {

        this.limit = limit;

    }

    search(messages = [], query = "") {

        if (!Array.isArray(messages)) {

            return [];

        }

        query = query.toLowerCase();

        const words = query
            .split(/\s+/)
            .filter(Boolean);

        const scored = [];

        for (const message of messages) {

            const text = (
                message.content || ""
            ).toLowerCase();

            let score = 0;

            for (const word of words) {

                if (text.includes(word)) {

                    score++;

                }

            }

            if (score > 0) {

                scored.push({

                    score,

                    message

                });

            }

        }

        scored.sort(

            (a, b) => b.score - a.score

        );

        return scored
            .slice(0, this.limit)
            .map(item => item.message);

    }

}