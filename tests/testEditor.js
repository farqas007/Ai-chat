import fs from "fs";
import os from "os";
import path from "path";

import {
readFile,
writeFile,
replaceCode
}
from "../editor/codeEditor.js";


const testFile =
path.join(os.tmpdir(), "ai-chat-editor-test.txt");

writeFile(
testFile,
"Hello<br>World<br>"
);


console.log(
readFile(testFile)
);


console.log(
replaceCode(
testFile,
"World",
"AI Chat"
)
);


const updated = readFile(testFile);


if(!updated.includes("AI Chat")){

    console.error("FAIL: replaceCode did not update file");

    process.exit(1);

}


console.log("replaceCode verification passed");


fs.unlinkSync(testFile);