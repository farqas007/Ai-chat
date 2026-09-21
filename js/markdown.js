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

    // If the AI deliberately returned structured HTML, sanitize
    // and render it. Detection is TAG-COMPLETE — a real "<tag...>"
    // — not a loose substring like "<p", which would also match
    // "<pricing" or "<python".
    if (this.looksLikeHTML(text)) {
        return this.sanitize(text);
    }

    let html = text;

    // Protect fenced code blocks FIRST so nothing inside a block body
    // (including template-literal backticks) is treated as inline code.
    // An empty fenced block is omitted entirely instead of being turned
    // into a useless box.
    const blocks = [];
    const inline = [];

    html = html.replace(
        /```([a-zA-Z0-9_+#.\-]*)\s*\n?([\s\S]*?)```/g,
        (match, language, code) => {
            const trimmed = code.trim();
            if (!trimmed) {
                return "";
            }
            blocks.push({
                language,
                code: trimmed
            });
            return `\u0000CODEBLOCK${blocks.length - 1}\u0000`;
        }
    );

    // Then protect single-backtick inline code in the remaining text.
    html = html.replace(/`([^`\n]+)`/g, (match, code) => {
        inline.push(code);
        return `\u0000INLINE${inline.length - 1}\u0000`;
    });

    html = this.escapeHTML(html);

    html = this.headings(html);

    html = this.bold(html);

    html = this.italic(html);

    html = this.lists(html);

    html = this.links(html);

    html = this.newLines(html);

    html = this.restoreInlineCode(html, inline);

    html = this.restoreCodeBlocks(html, blocks);

    return html;
}

    /* =======================================================
       LOOKS LIKE HTML
    ======================================================= */

    // Returns true only when the text contains a complete,
    // well-formed HTML tag (open, close or self-closing). This is
    // deliberately strict: a bare prefix such as "<p" in
    // "<pricing" must NOT be treated as HTML.
    looksLikeHTML(text) {

        return /<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^>]*)?\/?>/.test(
            String(text)
        );

    }

    /* =======================================================
       RESTORE CODE BLOCKS
    ======================================================= */

    restoreCodeBlocks(html, blocks) {

        return html.replace(
            /\u0000CODEBLOCK(\d+)\u0000/g,
            (match, index) => {

                const item = blocks[Number(index)];

                if (!item || !item.code || !item.code.trim()) {
                    return "";
                }

                const language = item.language
                    ? ` class="language-${item.language}"`
                    : "";

                return `<br><pre class="code-block"><code${language}>${this.escapeHTML(item.code)}</code></pre><br>`;

            }
        );

    }

    /* =======================================================
       RESTORE INLINE CODE
    ======================================================= */

    restoreInlineCode(html, inline) {

        return html.replace(
            /\u0000INLINE(\d+)\u0000/g,
            (match, index) => {

                const item = inline[Number(index)];

                if (item === undefined || item === "") {
                    return "";
                }

                return `<code>${this.escapeHTML(item)}</code>`;

            }
        );

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
    // Blocks javascript:, vbscript:, blob:, file:,
    // protocol-relative hosts and any scheme obfuscation / control chars.
    // data: URLs are blocked EXCEPT safe inline images (data:image/*)
    // which are needed for generated content display.
    safeUrl(value) {

        const trimmed = String(value || "").trim();

        if (!trimmed || trimmed.includes("\0")) {
            return null;
        }

        // Control characters (incl. newlines/tabs) can smuggle a
        // secondary URL past the scheme check.
        if (/[\u0001-\u0020\u007F]/.test(trimmed)) {
            return null;
        }

        const lower = trimmed.toLowerCase();

        // Allow safe inline images only. data:text/html, data:application/*,
        // javascript:, etc. remain blocked below.
        if (lower.startsWith("data:image/")) {
            return trimmed;
        }

        const FORBIDDEN_SCHEMES = [
            "javascript:",
            "vbscript:",
            "data:",
            "blob:",
            "file:"
        ];

        for (const scheme of FORBIDDEN_SCHEMES) {
            if (lower.startsWith(scheme)) {
                return null;
            }
        }

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
                        } else if (
                            child.tagName === "A" &&
                            name === "href" &&
                            url.toLowerCase().startsWith("data:")
                        ) {
                            child.removeAttribute(attr.name);
                        } else {
                            child.setAttribute(attr.name, url);
                        }
                        continue;
                    }

                    if (name === "class") {
                        const classes = String(attr.value || "")
                            .split(/\s+/)
                            .filter(cls =>
                                ALLOWED_CLASSES.has(cls) ||
                                /^language-/.test(cls)
                            );
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