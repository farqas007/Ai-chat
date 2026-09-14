import fs from "fs";


const memoryFile = "./memory/conversation-memory.json";


export function saveConversation(message){

    let history = loadConversation();


    history.push({

        message,
        time:new Date().toISOString()

    });


    fs.writeFileSync(
        memoryFile,
        JSON.stringify(history,null,2)
    );

}



export function loadConversation(){

    if(!fs.existsSync(memoryFile)){

        return [];

    }


    return JSON.parse(
        fs.readFileSync(
            memoryFile,
            "utf-8"
        )
    );

}
