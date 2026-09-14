import { PatchPlanner } from "../agent/patchPlanner.js";

const planner = new PatchPlanner();

const context = {
    relevantFiles: [
        "js/app.js",
        "js/chat.js",
        "css/style.css"
    ]
};

console.table(
    planner.plan(
        "Add dark mode",
        context
    )
);
