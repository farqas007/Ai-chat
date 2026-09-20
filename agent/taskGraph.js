export class TaskGraph {

    build(tasks = []) {

        if (!Array.isArray(tasks)) {
            return [];
        }

        return tasks.map((task, index) => ({

            id: index + 1,

            ...task,

            status: "pending",

            priority: task.priority ?? index + 1,

            dependsOn: task.dependsOn ?? [],

            retries: 0,

            startedAt: null,

            finishedAt: null

        }));

    }

    next(tasks) {

        return tasks
            .filter(task =>
                task.status === "pending" &&
                task.dependsOn.every(id =>
                    tasks.find(t => t.id === id)?.status === "done"
                )
            )
            .sort((a, b) => a.priority - b.priority)[0];

    }

    complete(task) {

        task.status = "done";
        task.finishedAt = Date.now();

    }

    fail(task) {

        task.status = "failed";

    }

    detectCycle(tasks) {

        if (!Array.isArray(tasks)) {

            return false;

        }

        const WHITE = 0;

        const GRAY = 1;

        const BLACK = 2;

        const color = new Map();

        for (const t of tasks) {

            color.set(t.id, WHITE);

        }

        const adj = new Map();

        for (const t of tasks) {

            adj.set(t.id, t.dependsOn || []);

        }

        const visit = (u) => {

            color.set(u, GRAY);

            for (const v of (adj.get(u) || [])) {

                const c = color.get(v);

                if (c === GRAY) {

                    return true;

                }

                if (c === WHITE && visit(v)) {

                    return true;

                }

            }

            color.set(u, BLACK);

            return false;

        };

        for (const t of tasks) {

            if (color.get(t.id) === WHITE && visit(t.id)) {

                return true;

            }

        }

        return false;

    }

}