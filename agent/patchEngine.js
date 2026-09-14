import fs from "fs";


export class PatchEngine {


    replace(
        filePath,
        oldCode,
        newCode
    ){

        try {

            const content =
                fs.readFileSync(
                    filePath,
                    "utf8"
                );


            if(
                !content.includes(oldCode)
            ){

                return {

                    success:false,

                    message:
                    "Old code not found"

                };

            }


            const updated =
                content.replace(
                    oldCode,
                    newCode
                );


            fs.writeFileSync(
                filePath,
                updated,
                "utf8"
            );


            return {

                success:true,

                file:filePath,

                message:
                "Code replaced successfully"

            };


        } catch(error){


            return {

                success:false,

                error:error.message

            };


        }

    }


}
