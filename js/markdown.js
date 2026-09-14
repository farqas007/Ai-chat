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

    // Agar AI ne HTML bheja hai to sanitize karke render karo
    if (
        text.includes("<h") ||
        text.includes("<p") ||
        text.includes("<ul") ||
        text.includes("<li") ||
        text.includes("<strong") ||
        text.includes("<br")
    ){
        return this.sanitize(text);
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

        )

        .replace(

            /"/g,

            "&quot;"

        )

        .replace(

            /'/g,

            "&#39;"

        );


    }




    /* =======================================================
       SAFE URL / BODY
    ======================================================= */


    // Allows http(s), mailto and relative URLs only.
    // Blocks javascript:, data:, vbscript: and protocol-relative hosts.
    safeUrl(value) {

        const trimmed = String(value || "").trim();

        if (!trimmed || trimmed.includes("\0")) {
            return null;
        }

        const lower = trimmed.toLowerCase();

        if (
            lower.startsWith("http://") ||
            lower.startsWith("https://") ||
            lower.startsWith("mailto:")
        ) {
            return trimmed;
        }

        if (
            lower.startsWith("//") ||
            lower.includes("\\")
        ) {
            return null;
        }

        if (
            lower.startsWith("/") ||
            lower.startsWith("./") ||
            lower.startsWith("../")
        ) {
            return trimmed;
        }

        return null;

    }


    // Strips everything except an allowlist of safe tags/attributes.
    // https://developer.mozilla.org/docs/Web/API/DOMParser
    sanitize(html) {

        if (typeof document === "undefined") {
            return this.escapeHTML(html);
        }

        const REMOVE = new Set([
            "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "META",
            "LINK", "BASE", "FORM", "INPUT", "BUTTON", "SELECT",
            "TEXTAREA", "TEMPLATE", "SVG", "MATH"
        ]);

        const ALLOWED = new Set([
            "H1", "H2", "H3", "H4", "H5", "H6", "P", "UL", "OL",
            "LI", "STRONG", "EM", "B", "I", "U", "CODE", "PRE",
            "BR", "SPAN", "DIV", "A", "BLOCKQUOTE", "TABLE",
            "THEAD", "TBODY", "TR", "TH", "TD", "HR", "SUP",
            "SUB", "SECTION", "HEADER", "FOOTER", "MAIN", "SMALL",
            "IMG"
        ]);

        const ALLOWED_ATTRS = new Set([
            "href", "target", "rel", "class", "src", "alt",
            "title", "colspan", "rowspan"
        ]);

        const ALLOWED_CLASSES = new Set(["code-block"]);

        const safeUrl =
            (url) => this.safeUrl(url);

        const template = document.createElement("template");
        template.innerHTML = String(html);

        function clean(node) {

            for (const child of Array.from(node.children)) {

                const tag = child.tagName;

                if (REMOVE.has(tag)) {
                    child.remove();
                    continue;
                }

                if (!ALLOWED.has(tag)) {
                    child.replaceWith(...child.childNodes);
                    clean(node);
                    continue;
                }

                for (const attr of Array.from(child.attributes)) {

                    const name = attr.name.toLowerCase();

                    if (name.startsWith("on")) {
                        child.removeAttribute(attr.name);
                        continue;
                    }

                    if (!ALLOWED_ATTRS.has(name)) {
                        child.removeAttribute(attr.name);
                        continue;
                    }

                    if (name === "href" || name === "src") {
                        const url = safeUrl(attr.value);
                        if (!url) {
                            child.removeAttribute(attr.name);
                        } else {
                            child.setAttribute(attr.name, url);
                        }
                        continue;
                    }

                    if (name === "class") {
                        const classes = String(attr.value || "")
                            .split(/\s+/)
                            .filter(cls => ALLOWED_CLASSES.has(cls));
                        if (classes.length === 0) {
                            child.removeAttribute("class");
                        } else {
                            child.setAttribute("class", classes.join(" "));
                        }
                        continue;
                    }

                }

                if (child.tagName === "A" && child.hasAttribute("href")) {
                    child.setAttribute("rel", "noopener noreferrer");
                }

                clean(child);

            }

        }

        clean(template.content);

        return template.innerHTML;

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

            (match, label, url) => {

                const safe = this.safeUrl(url);

                if (!safe) {
                    return label;
                }

                return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;

            }

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