import { exec } from "child_process";


const blocked = [
    "rm -rf",
    "mkfs",
    "dd ",
    "shutdown",
    "reboot",
    "format",
    ":(){ ",        // fork bomb
    "wget ",
    "curl ",
    "nc ",
    "ncat ",
    "socat ",
    "> /dev/sd",    // overwrite block device
    "mv / ",
    "chmod 777",
    "chown root"
];


const DANGEROUS_CHARS = /[;&|`$(){}[\]!#~<>]/;


export function runCommand(command){

    if(typeof command !== "string" || !command.trim()){
        return Promise.resolve("Invalid command");
    }


    const lower = command.toLowerCase().trim();


    if(DANGEROUS_CHARS.test(command)){
        return Promise.resolve(
            "Command contains unsafe characters and was blocked"
        );
    }


    for(const item of blocked){

        if(lower.includes(item)){

            return Promise.resolve(
                "Command blocked for safety"
            );

        }

    }


    return new Promise((resolve)=>{


        exec(
            command,
            {
                timeout: 10000,
                maxBuffer: 1024 * 1024
            },
            (error,stdout,stderr)=>{


                if(error){

                    resolve(
                        error.killed
                            ? "Command timed out"
                            : error.message
                    );

                    return;

                }


                resolve(
                    stdout || stderr || ""
                );


            }
        );


    });

}
