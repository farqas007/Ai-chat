import { DiffEngine } from "../agent/diffEngine.js";

const engine = new DiffEngine();

const oldCode = `

function hello(){

console.log("Hello");

}

`;

const newCode = `

function hello(){

console.log("Hello World");

}

`;

const diff = engine.create(oldCode, newCode);

console.log(diff);

console.log(

engine.apply(oldCode, diff)

);