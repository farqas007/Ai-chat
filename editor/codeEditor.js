import fs from "fs";


export function readFile(file){

    if(!fs.existsSync(file)){

        return "File not found";

    }


    return fs.readFileSync(
        file,
        "utf-8"
    );

}



export function writeFile(file,content){

    fs.writeFileSync(
        file,
        content,
        "utf-8"
    );


    return "File updated successfully";

}



export function replaceCode(
    file,
    oldCode,
    newCode
){

    let content = readFile(file);


    if(content.includes(oldCode)){


        content = content.replace(
            oldCode,
            newCode
        );


        writeFile(
            file,
            content
        );


        return "Code replaced";

    }


    return "Old code not found";

}
