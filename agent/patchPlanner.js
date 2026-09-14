export class PatchPlanner {

    plan(task = "", context = {}) {

        const files = context.relevantFiles || [];

        const operations = [];

        for (const file of files) {

            operations.push({

                action: "modify",

                file,

                reason: task,

                backup: true,

                priority: 1

            });

        }

        if (operations.length === 0) {

            operations.push({

                action: "create",

                file: "index.html",

                reason: task,

                backup: false,

                priority: 1

            });

        }

        return operations.sort(
            (a, b) => a.priority - b.priority
        );

    }

}