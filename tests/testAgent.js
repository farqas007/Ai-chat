import { CodeAgent } from "../agent/codeAgent.js";


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


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}