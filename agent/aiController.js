import { Planner } from "./planner.js";
import { FileAgent } from "./fileAgent.js";
import { ToolManager } from "./toolManager.js";
import { CodeAgent } from "./codeAgent.js";

const planner = new Planner();
const fileAgent = new FileAgent();
const tools = new ToolManager();
const codeAgent = new CodeAgent();

export class AIController {

    async execute(task){

        console.log("AI Task:", task);

        const plan = planner.create(task);

        for(const step of plan){

            console.log("Step:", step);

            if(step.type === "file"){
                fileAgent.execute(step);
            }

            tools.execute(step);
        }

        const generatedCode = codeAgent.generate(task);

        console.log("Generated Files:");
        console.log(generatedCode);

        return {
            plan,
            files: generatedCode
        };
    }

}