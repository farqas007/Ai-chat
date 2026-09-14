import { FileAgent } from "../agent/fileAgent.js";


const agent =
new FileAgent();


const result =
await agent.execute({

    action:"create",

    file:"hello-ai.txt",

    content:"AI Agent created this file"

});


console.log(result);
