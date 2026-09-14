import { FileAgent } from "./agent/fileAgent.js";

const agent = new FileAgent(".");

const result = agent.analyze("agent/codeAgent.js");

console.dir(result, { depth: null });
