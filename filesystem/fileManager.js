import fs from "fs/promises";


export async function readFile(path){

    return await fs.readFile(path,"utf-8");

}


export async function writeFile(path,content){

    await fs.writeFile(path,content,"utf-8");

    console.log("File updated:",path);

}


export async function createFile(path,content=""){

    await fs.writeFile(path,content);

    console.log("File created:",path);

}


export async function deleteFile(path){

    await fs.unlink(path);

    console.log("File deleted:",path);

}
