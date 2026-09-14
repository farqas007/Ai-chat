import fs from "fs";


const memoryFile = "./memory/project-memory.json";


export function saveProjectMemory(data){

    fs.writeFileSync(
        memoryFile,
        JSON.stringify(data,null,2)
    );

}


export function loadProjectMemory(){

    if(!fs.existsSync(memoryFile)){
        return {};
    }


    return JSON.parse(
        fs.readFileSync(memoryFile,"utf-8")
    );

}
