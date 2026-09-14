import { FileAgent } from "../agent/fileAgent.js";


const file =
new FileAgent();


const result =
file.execute({

    action:"edit",

    file:"test-edit.txt",

    oldCode:"Hello",

    newCode:"Hi"

});


console.log(result);
