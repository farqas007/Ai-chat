import fs from "fs";
import path from "path";
import { PatchEngine } from "./patchEngine.js";
// import {
//     createFile,
//     writeFile,
//     deleteFile,
//     readFile
// } from "../filesystem/fileManager.js";


export class FileAgent {

constructor(root="."){

    this.root = root;

    this.patch = new PatchEngine();


    if(!fs.existsSync(this.root)){

        fs.mkdirSync(
            this.root,
            {
                recursive:true
            }
        );

    }

}

   execute(action){

    console.log(
        "File operation:",
        action
    );


    if(action.action === "create"){

    let fileName = action.file;


// agar file already generated-project se start ho rahi hai
// toh usko remove karo

if(fileName.startsWith("generated-project")){
    
    fileName =
    fileName.replace(
        "generated-project/",
        ""
    );

}


const filePath =
path.join(
    this.root,
    fileName
);


    const folder =
    path.dirname(filePath);


    if(!fs.existsSync(folder)){

        fs.mkdirSync(
            folder,
            {
                recursive:true
            }
        );

    }


    fs.writeFileSync(
        filePath,
        action.content || "",
        "utf8"
    );


    console.log(
        "Created:",
        filePath
    );


    return {

        success:true,

        file:filePath,

        message:"File created"

    };

}



}

 read(file){

const fullPath = path.join(
this.root,
file
);

console.log("Reading file:", fullPath);

const content = fs.readFileSync(
fullPath,
"utf8"
);

return content;

}


    analyze(filePath){

        const content =
        this.read(filePath);


        if(!content)
        return null;


        const imports =
        content.match(/^import .*$/gm) || [];


        const classes =
        content.match(/class\s+[A-Za-z0-9_]+/g) || [];


        const functions =
        content.match(/[A-Za-z0-9_]+\s*\([^)]*\)\s*\{/g) || [];


        return {

            imports,

            classes,

            functions,

            totalImports:
            imports.length,

            totalClasses:
            classes.length,

            totalFunctions:
            functions.length,

            lines:
            content.split("\n").length

        };

    }

}
