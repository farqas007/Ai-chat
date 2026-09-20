import { CodeAgent } from "../agent/codeAgent.js";
import { TaskGraph } from "../agent/taskGraph.js";


const ai = new CodeAgent();

const passed = [];
const failed = [];


function assert(name, condition) {
    if (condition) {
        passed.push(name);
        console.log(`PASS: ${name}`);
    } else {
        failed.push(name);
        console.log(`FAIL: ${name}`);
    }
}


const plan = ai.planner.create("Create a website");
assert("planner returns steps", Array.isArray(plan) && plan.length > 0);
assert("planner includes analysis step", plan.some(s => s.type === "analysis"));
assert("planner includes code step", plan.some(s => s.type === "code"));


const site = ai.analyzePrompt("restaurant");
assert("analyzePrompt detects restaurant", site.type === "restaurant");


const files = ai.createWebsite("Create a website");
assert("createWebsite builds index.html", files["index.html"].includes("<!DOCTYPE html>"));
assert("createWebsite builds style.css", typeof files["style.css"] === "string");


const result = ai.scanProject();
assert("scanProject returns files", Array.isArray(result.files));
assert("scanProject returns project type", !!result.project);


const intent = ai.detectIntent("build a login page");
assert("detectIntent returns result", !!intent && typeof intent === "object");


/* TaskGraph cycle detection */

const tg = new TaskGraph();

const acyclic = tg.build([
    { type: "a", dependsOn: [] },
    { type: "b", dependsOn: [1] },
    { type: "c", dependsOn: [2] }
]);
assert("acyclic graph has no cycle", tg.detectCycle(acyclic) === false);

const cyclic = tg.build([
    { type: "a", dependsOn: [2] },
    { type: "b", dependsOn: [1] }
]);
assert("cyclic graph is detected", tg.detectCycle(cyclic) === true);

const selfCycle = tg.build([
    { type: "a", dependsOn: [1] }
]);
assert("self-referencing cycle is detected", tg.detectCycle(selfCycle) === true);

const empty = tg.build([]);
assert("empty graph has no cycle", tg.detectCycle(empty) === false);

const disconnected = tg.build([
    { type: "a", dependsOn: [] },
    { type: "b", dependsOn: [] }
]);
assert("disconnected graph has no cycle", tg.detectCycle(disconnected) === false);


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}