import {
runCommand
}
from "../terminal/terminalAgent.js";


const result = await runCommand(
"ls"
);


console.log(result);
