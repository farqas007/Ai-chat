export class ConversationSummarizer {

    constructor(limit = 100) {

        this.limit = limit;

    }

    summarize(messages = []) {

        if (!Array.isArray(messages)) {

            return null;

        }

        if (messages.length <= this.limit) {

            return null;

        }

        const oldMessages = messages.slice(
            0,
            messages.length - this.limit
        );

        const summary = [];

        for (const message of oldMessages) {

            summary.push(

                `${message.role}: ${message.content}`

            );

        }

        return {

            role: "system",

            content:

`Conversation Summary

${summary.join("\n")}`

        };

    }

}