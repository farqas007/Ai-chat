/* ===========================================================
   AI CHAT
   File : markdown.js
   Description : Markdown Renderer
=========================================================== */


/* ===========================================================
   MARKDOWN MANAGER
=========================================================== */


export class Markdown {



    constructor(){


        this.enabled = true;



        console.log(

            "Markdown Renderer Created"

        );


    }





    /* =======================================================
       RENDER
    ======================================================= */


   render(text = ""){

    if(!this.enabled){
        return text;
    }

    // Agar AI ne HTML bheja hai to direct render karo
    if (
        text.includes("<h") ||
        text.includes("<p") ||
        text.includes("<ul") ||
        text.includes("<li") ||
        text.includes("<strong") ||
        text.includes("<br")
    ){
        return text;
    }

    let html = text;

    html = this.escapeHTML(html);

    html = this.codeBlocks(html);

    html = this.headings(html);

    html = this.bold(html);

    html = this.italic(html);

    html = this.lists(html);

    html = this.links(html);

    html = this.newLines(html);

    return html;
}




    /* =======================================================
       ESCAPE HTML
    ======================================================= */


    escapeHTML(text){


        return text

        .replace(

            /&/g,

            "&amp;"

        )

        .replace(

            /</g,

            "&lt;"

        )

        .replace(

            />/g,

            "&gt;"

        );



    }





    /* =======================================================
       CODE BLOCKS
    ======================================================= */


    codeBlocks(text){


        return text.replace(

            /```([\s\S]*?)```/g,


            (match,code)=>{


                return `

<pre class="code-block">

<code>

${code.trim()}

</code>

</pre>

`;

            }

        );


    }





    /* =======================================================
       HEADINGS
    ======================================================= */


    headings(text){


        return text

        .replace(

            /^### (.*)$/gm,

            "<h3>$1</h3>"

        )

        .replace(

            /^## (.*)$/gm,

            "<h2>$1</h2>"

        )

        .replace(

            /^# (.*)$/gm,

            "<h1>$1</h1>"

        );


    }





    /* =======================================================
       BOLD
    ======================================================= */


    bold(text){


        return text.replace(

            /\*\*(.*?)\*\*/g,

            "<strong>$1</strong>"

        );


    }





    /* =======================================================
       ITALIC
    ======================================================= */


    italic(text){


        return text.replace(

            /\*(.*?)\*/g,

            "<em>$1</em>"

        );


    }





    /* =======================================================
       LISTS
    ======================================================= */


    lists(text){


        return text.replace(

            /^- (.*)$/gm,

            "<li>$1</li>"

        );


    }





    /* =======================================================
       LINKS
    ======================================================= */


    links(text){


        return text.replace(

            /\[(.*?)\]\((.*?)\)/g,


            `<a href="$2" target="_blank">$1</a>`

        );


    }





    /* =======================================================
       NEW LINES
    ======================================================= */


    newLines(text){


        return text.replace(

            /\n/g,

            "<br>"

        );


    }





    /* =======================================================
       ENABLE / DISABLE
    ======================================================= */


    setEnabled(value){


        this.enabled = value;


    }



}