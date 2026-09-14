export class IntentParser {

    parse(prompt = "") {

        const text = prompt.toLowerCase();

        if (
            text.includes("fix") ||
            text.includes("bug") ||
            text.includes("error")
        ) {

            return {
                type: "fix"
            };

        }

        if (
            text.includes("create") ||
            text.includes("make") ||
            text.includes("build")
        ) {

            return {
                type: "create"
            };

        }

        if (
            text.includes("edit") ||
            text.includes("change") ||
            text.includes("update")
        ) {

            return {
                type: "edit"
            };

        }

        if (
            text.includes("delete") ||
            text.includes("remove")
        ) {

            return {
                type: "delete"
            };

        }

        return {

            type: "unknown"

        };

    }

}