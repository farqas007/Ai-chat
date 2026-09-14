import {
    extractFileName,
    extractKeyword,
    extractPatch
} from "./taskParser.js";


export class Planner {

    create(task) {

        const plan = [];
        const lower = task.toLowerCase();

        plan.push({
            type: "analysis",
            text: `Analyze task: ${task}`,
            priority: 1
        });

        plan.push({
            type: "scan",
            target: "project",
            priority: 2,
            dependsOn: [1]
        });

        plan.push({
            type: "memory",
            action: "load",
            priority: 3,
            dependsOn: [2]
        });

        if (
            lower.includes("change") ||
            lower.includes("edit") ||
            lower.includes("modify") ||
            lower.includes("update")
        ) {

            const patch = extractPatch(task) || {};

            plan.push({
                type: "find",
                target: "file",
                task,
                fileHint: extractFileName(task),
                keyword: extractKeyword(task),
                priority: 4,
                dependsOn: [3]
            });

            plan.push({
                type: "read",
                target: "file",
                priority: 5,
                dependsOn: [4]
            });

            plan.push({
                type: "patch",
                action: "generate",
                task,
                oldCode: patch.oldCode,
                newCode: patch.newCode,
                priority: 6,
                dependsOn: [5]
            });

            plan.push({
                type: "file",
                action: "edit",
                priority: 7,
                dependsOn: [6]
            });

            plan.push({
                type: "memory",
                action: "save",
                priority: 8,
                dependsOn: [7]
            });

            plan.push({
                type: "verify",
                target: "project",
                priority: 9,
                dependsOn: [8]
            });

        } else {

            plan.push({
                type: "code",
                task,
                priority: 4,
                dependsOn: [3]
            });

            plan.push({
                type: "file",
                action: "create",
                target: "project",
                task,
                priority: 5,
                dependsOn: [4]
            });

            plan.push({
                type: "memory",
                action: "save",
                priority: 6,
                dependsOn: [5]
            });

            plan.push({
                type: "verify",
                target: "project",
                priority: 7,
                dependsOn: [6]
            });

        }

        return plan;

    }

}