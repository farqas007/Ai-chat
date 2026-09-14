import path from "path";


export class FilePlanner {


    constructor(){

        this.outputFolder = "generated-project";

    }



    plan(files){


        const result = [];


        for(const file in files){


            const newFile =
            path.join(
                this.outputFolder,
                file
            );


            result.push({

                action:"create",

                file:newFile,

                content:files[file]

            });


        }


        return result;


    }


}