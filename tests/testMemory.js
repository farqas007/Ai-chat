import {
saveProjectMemory,
loadProjectMemory
}
from "../memory/projectMemory.js";


saveProjectMemory({

project:"Ai-chat",

features:[
"voice",
"memory",
"code editor"
],

language:"Urdu"

});


console.log(
loadProjectMemory()
);
