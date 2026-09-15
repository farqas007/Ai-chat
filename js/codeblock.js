/* ===========================================================
   AI CHAT
   File : codeblock.js
   Description : Code Block Manager
=========================================================== */


/* ===========================================================
   CODE BLOCK MANAGER
=========================================================== */


export class CodeBlock {



    constructor(){


        this.blocks = [];


        console.log(

            "CodeBlock Manager Created"

        );


    }





    /* =======================================================
       INITIALIZE
    ======================================================= */


    initialize(){


        this.findBlocks();


        this.addCopyButtons();


        this.addLanguageLabels();


        console.log(

            "Code Blocks Initialized"

        );


    }





    /* =======================================================
       FIND CODE BLOCKS
    ======================================================= */


    findBlocks(){


        const nodes =

            document.querySelectorAll(

                "pre.code-block code"

            );


        this.blocks = [];


        nodes.forEach(

            code => {



                // Skip (and remove) empty code blocks: a block with no
                // meaningful content is not usable, so it must not
                // render a grey box with a useless Copy button. The
                // surrounding message text is unaffected because only
                // the empty <pre> element is removed.

                const content =

                    (code.textContent || "").trim();


                if(!content){


                    const pre =

                        code.parentElement;


                    if(

                        pre &&

                        pre.parentElement

                    ){


                        pre.remove();

                        return;

                    }


                }


                this.blocks.push(code);


            }

        );


        return this.blocks;


    }





    /* =======================================================
       ADD COPY BUTTONS
    ======================================================= */


    addCopyButtons(){


        this.blocks.forEach(

            code => {



                const container =

                    code.parentElement;



                if(

                    container.querySelector(

                        ".copy-code"

                    )

                ){

                    return;

                }



                const button =

                    document.createElement(

                        "button"

                    );



                button.className =

                    "copy-code";



                button.textContent =

                    "Copy";



                button.addEventListener(

                    "click",

                    ()=>{


                        this.copy(

                            code.textContent,

                            button

                        );


                    }

                );



                container.appendChild(

                    button

                );



            }

        );


    }





    /* =======================================================
       COPY CODE
    ======================================================= */


    async copy(

        code,

        button

    ){


        try{


            await navigator.clipboard.writeText(

                code

            );



            button.textContent =

                "Copied!";



            setTimeout(

                ()=>{


                    button.textContent =

                        "Copy";


                },

                1500

            );


        }


        catch(error){


            console.error(

                "Copy Failed",

                error

            );


        }


    }





    /* =======================================================
       GET LANGUAGE
    ======================================================= */


    getLanguage(codeElement){


        const className =

            codeElement.className;



        if(

            className.includes(

                "language-"

            )

        ){


            return className

            .replace(

                "language-",

                ""

            );


        }



        return "text";


    }





    /* =======================================================
       ADD LANGUAGE LABEL
    ======================================================= */


    addLanguageLabels(){


        this.blocks.forEach(

            code=>{


                const language =

                    this.getLanguage(

                        code

                    );


                const container =

                    code.parentElement;


                if(

                    container.querySelector(

                        ".code-language"

                    )

                ){

                    return;

                }


                const label =

                    document.createElement(

                        "span"

                    );


                label.className =

                    "code-language";


                label.textContent =

                    language;


                container.insertBefore(

                    label,

                    code


                );


            }

        );


    }





    /* =======================================================
       DOWNLOAD CODE
    ======================================================= */


    download(

        code,

        filename = "code.txt"

    ){


        const blob =

            new Blob(

                [code],

                {

                    type:

                    "text/plain"

                }

            );



        const url =

            URL.createObjectURL(

                blob

            );



        const link =

            document.createElement(

                "a"

            );



        link.href = url;


        link.download = filename;



        link.click();



        URL.revokeObjectURL(

            url

        );


    }





    /* =======================================================
       REFRESH
    ======================================================= */


    refresh(){


        this.findBlocks();


        this.addCopyButtons();


        this.addLanguageLabels();


    }





    /* =======================================================
       DESTROY
    ======================================================= */


    destroy(){


        this.blocks = [];


        console.log(

            "CodeBlock Destroyed"

        );


    }



}