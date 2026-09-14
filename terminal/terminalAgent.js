import { exec } from "child_process";


const blocked = [
    "rm -rf",
    "mkfs",
    "dd",
    "shutdown",
    "reboot"
];


export function runCommand(command){

    for(const item of blocked){

        if(command.includes(item)){

            return Promise.resolve(
                "Command blocked for safety"
            );

        }

    }


    return new Promise((resolve)=>{


        exec(
            command,
            (error,stdout,stderr)=>{


                if(error){

                    resolve(
                        error.message
                    );

                    return;

                }


                resolve(
                    stdout || stderr
                );


            }
        );


    });

}
