import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";


const ignore = [
    "node_modules",
    ".git",
    ".cache",
    "dist",
    "build"
];


export class ProjectScanner {


    constructor(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {

        this.root = root;

    }


    scan(folder = this.root) {

        let files = [];


        const walk = (current)=>{

            const items = fs.readdirSync(current);


            for(const item of items){


                if(ignore.includes(item)){
                    continue;
                }


                const fullPath =
                    path.join(current,item);


                const stat =
                    fs.statSync(fullPath);



                if(stat.isDirectory()){

                    walk(fullPath);

                }
                else{

                    files.push(
                        path.relative(folder,fullPath)
                    );

                }

            }

        };


        walk(folder);


        return files;

    }



    findFile(files, keyword){

        return files.filter(file =>
            file
            .toLowerCase()
            .includes(keyword.toLowerCase())
        );

    }



    summarize(files){

        return {

            totalFiles: files.length,

            javascript:
            files.filter(
                f=>f.endsWith(".js")
            ).length,

            html:
            files.filter(
                f=>f.endsWith(".html")
            ).length,

            css:
            files.filter(
                f=>f.endsWith(".css")
            ).length

        };

    }



    detectProject(files){

        return {

            hasThreeJS:
            files.some(
                f=>f.includes("three")
            ),

            hasReact:
            files.some(
                f=>f.includes("react")
            ),

            hasTailwind:
            files.some(
                f=>f.includes("tailwind")
            )

        };

    }


}