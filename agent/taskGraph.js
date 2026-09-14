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

}