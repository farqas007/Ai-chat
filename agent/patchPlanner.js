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

        // No phantom "create index.html" fallback: with no relevant files
        // nothing can be safely patched, so an empty plan is returned.
        // A generated create that could overwrite an existing file is
        // never invented here.

        return operations.sort(

            (a, b) => a.priority - b.priority

        );

    }

}