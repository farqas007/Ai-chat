import { Planner } from "../agent/planner.js";
import { CodeAgent } from "../agent/codeAgent.js";


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


const planner = new Planner();
const plan = planner.create("Create a website");
assert("planner returns steps", Array.isArray(plan) && plan.length > 0);


const codeAgent = new CodeAgent();
const generated = codeAgent.generate("Create a website");
assert("generate returns index.html", !!generated["index.html"]);
assert("generate returns style.css", !!generated["style.css"]);


const files = codeAgent.createWebsite("restaurant");
assert("createWebsite builds valid html", files["index.html"].includes("<!DOCTYPE html>"));


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}