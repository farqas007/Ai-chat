/* ===========================================================
   Regression tests for the markdown renderer.

   F2: multiline fenced code blocks must keep their real line
       breaks (copying a code block returns the original code).
   F3: a fenced code language (```js) must be captured and
       rendered as a language-* class.
   F1: strings like "<p", "<table", "<ul" etc. must NOT trigger
       the raw-HTML path unless they form a complete HTML tag.
   safeUrl: data:image/* URLs are allowed for generated content;
       all other data: schemes, javascript:, vbscript:, blob:,
       file: remain blocked.
   Existing Markdown behavior (headings, bold, italic, lists,
   links) must remain intact.
=========================================================== */

import { Markdown } from "../js/markdown.js";


const passed = [];
const failed = [];

function assert(name, condition) {
    if (condition) {
        passed.push(name);
        console.log(`PASS: ${name}`);
    } else {
        failed.push(name);
        console.log(`FAIL: ${name}`);
    }
}

const md = new Markdown();


/* -----------------------------------------------------------
   TEST 1 — Multiline fenced code keeps real line breaks.
----------------------------------------------------------- */

function testMultilineCodeBlock() {

    const source = [
        "Here is the code:",
        "```js",
        "const x = 1;",
        "const y = 2;",
        "function add() {",
        "  return x + y;",
        "}",
        "```",
        "Done."
    ].join("\n");

    const html = md.render(source);

    assert(
        "T1 code block rendered as pre.code-block",
        html.includes('<pre class="code-block">')
    );

    assert(
        "T1 language captured as class",
        html.includes('<code class="language-js">')
    );

    const codeBlock = html.match(
        /<pre class="code-block">\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/
    );

    const content = codeBlock ? codeBlock[1] : "";

    assert(
        "T1 code content exists",
        content.length > 0
    );

    assert(
        "T1 code content has REAL newlines",
        content.includes("const x = 1;\nconst y = 2;")
    );

    assert(
        "T1 code content does NOT use <br> for line breaks",
        !content.includes("<br>")
    );

    assert(
        "T1 copy would return 5 original lines",
        content.split("\n").filter(Boolean).length === 5
    );

}


/* -----------------------------------------------------------
   TEST 2 — Code block without a language still renders, and the
   language class is omitted (no empty class attribute).
----------------------------------------------------------- */

function testCodeBlockWithoutLanguage() {

    const source = [
        "```",
        "plain text",
        "still has",
        "newlines",
        "```"
    ].join("\n");

    const html = md.render(source);

    assert(
        "T2 plain fence renders",
        html.includes('<pre class="code-block">')
    );

    assert(
        "T2 plain fence has <code> with no class",
        html.includes('<code>plain text\nstill has\nnewlines</code>')
    );

}


/* -----------------------------------------------------------
   TEST 3 — "<p", "<table", "<ul" inside ordinary text do NOT
   unexpectedly take the raw-HTML path.
----------------------------------------------------------- */

function testLooseTagPrefixesStayText() {

    const source = "Use <pricing and <python and <table-like words.";

    const html = md.render(source);

    assert(
        "T3 prefixes like <p are escaped, not treated as HTML",
        html.includes("&lt;pricing") &&
        html.includes("&lt;python") &&
        html.includes("&lt;table-like")
    );

    assert(
        "T3 no raw tag markup leaked through",
        !html.includes("<pricing") &&
        !html.includes("<python")
    );

}


/* -----------------------------------------------------------
   TEST 4 — A COMPLETE HTML tag still takes the sanitize path
   (explicit, safe decision).
----------------------------------------------------------- */

function testCompleteTagStillSanitized() {

    const source = "The <table> tag is helpful.";

    const html = md.render(source);

    assert(
        "T4 complete tag is escaped (no real DOMParser in node)",
        html.includes("&lt;table&gt;")
    );

    assert(
        "T4 output is safe",
        !html.includes("<table>")
    );

}


/* -----------------------------------------------------------
   TEST 5 — Existing Markdown behavior remains intact.
----------------------------------------------------------- */

function testExistingMarkdownIntact() {

    assert(
        "T5 heading renders",
        md.render("# Title") === "<h1>Title</h1>"
    );

    assert(
        "T5 bold renders",
        md.render("**bold**") === "<strong>bold</strong>"
    );

    assert(
        "T5 italic renders",
        md.render("*it*") === "<em>it</em>"
    );

    assert(
        "T5 list renders",
        md.render("- item") === "<li>item</li>"
    );

    assert(
        "T5 link renders safely",
        md.render("[site](https://example.com)") ===
        '<a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a>'
    );

    assert(
        "T5 newlines become <br>",
        md.render("line one\nline two") === "line one<br>line two"
    );

    const combined = md.render([
        "# Title",
        "",
        "Some **bold** and *italic* text",
        "```js",
        "const a = 1;",
        "const b = 2;",
        "```",
        "Then a [link](https://example.com)."
    ].join("\n"));

    assert(
        "T5 combined doc keeps heading",
        combined.includes("<h1>Title</h1>")
    );

    assert(
        "T5 combined doc keeps bold",
        combined.includes("<strong>bold</strong>")
    );

    assert(
        "T5 combined doc keeps link",
        combined.includes('href="https://example.com"')
    );

    assert(
        "T5 combined doc keeps code newlines",
        combined.includes("const a = 1;\nconst b = 2;")
    );

}


/* -----------------------------------------------------------
   TEST 6 — Empty fenced blocks are omitted entirely.
----------------------------------------------------------- */

function testEmptyFenceOmitted() {

    const blankFence = [
        "Some text",
        "```",
        "```",
        "More text"
    ].join("\n");

    const html = md.render(blankFence);

    assert(
        "T6 empty fence produces no code block",
        !html.includes('<pre class="code-block">')
    );

    assert(
        "T6 empty fence backticks removed",
        !html.includes("```")
    );

    assert(
        "T6 surrounding text survives",
        html.includes("Some text") &&
        html.includes("More text")
    );

    const languageEmpty =
        md.render("```javascript\n```");

    assert(
        "T6 empty fenced block with language is omitted",
        languageEmpty.trim() === ""
    );

}


/* -----------------------------------------------------------
   TEST 7 — Multiple code blocks keep language + content.
----------------------------------------------------------- */

function testMultipleCodeBlocks() {

    const source = [
        "First:",
        "```js",
        "const a = 1;",
        "```",
        "",
        "Second:",
        "```python",
        "print(2)",
        "```"
    ].join("\n");

    const html = md.render(source);

    const blocks =
        html.split('<pre class="code-block">').length - 1;

    assert(
        "T7 both block wrappers present",
        blocks === 2
    );

    assert(
        "T7 first language class preserved",
        html.includes(
            '<code class="language-js">const a = 1;</code>'
        )
    );

    assert(
        "T7 second language class preserved",
        html.includes(
            '<code class="language-python">print(2)</code>'
        )
    );

}


/* -----------------------------------------------------------
   TEST 8 — Inline code renders and stays untouched by the
   bold, italic and link transforms.
----------------------------------------------------------- */

function testInlineCode() {

    const inline =
        md.render("Call the `fetch(url)` helper.");

    assert(
        "T8 inline code wraps in <code>",
        inline.includes("<code>fetch(url)</code>")
    );

    const special =
        md.render("The `a && b` and `x < y` values.");

    assert(
        "T8 inline code escapes &",
        special.includes("<code>a &amp;&amp; b</code>")
    );

    const link =
        md.render("See `[not a link]` inside backticks.");

    assert(
        "T8 inline code resists link transform",
        link.includes("<code>[not a link]</code>") &&
        !link.includes("<a href=")
    );

    const italic =
        md.render("Keep `code *inside*` intact.");

    assert(
        "T8 inline code resists italic transform",
        italic.includes("<code>code *inside*</code>") &&
        !italic.includes("<em>")
    );

}


/* -----------------------------------------------------------
   TEST 9 — Special characters inside fenced code survive
   with the language class intact.
----------------------------------------------------------- */

function testCodeSpecialCharacters() {

    const source = [
        "```javascript",
        'console.log("a < b && c > d");',
        "const s = `tick`;",
        "```"
    ].join("\n");

    const html = md.render(source);

    assert(
        "T9 language class preserved",
        html.includes('<code class="language-javascript">')
    );

    assert(
        "T9 < is escaped",
        html.includes("a &lt; b")
    );

    assert(
        "T9 > is escaped",
        html.includes("c &gt; d")
    );

    assert(
        "T9 & is escaped",
        html.includes("&amp;&amp;")
    );

    assert(
        "T9 template literal backticks preserved",
        html.includes("`tick`")
    );

}


testMultilineCodeBlock();

testCodeBlockWithoutLanguage();

testLooseTagPrefixesStayText();

testCompleteTagStillSanitized();

testExistingMarkdownIntact();

testEmptyFenceOmitted();

testMultipleCodeBlocks();

testInlineCode();

testCodeSpecialCharacters();


/* -----------------------------------------------------------
   TEST 10 — safeUrl: data:image/* URLs are allowed (generated
   content display). All other data: schemes remain blocked.
----------------------------------------------------------- */

function testSafeUrlDataImage() {

    assert(
        "T10 data:image/jpeg;base64 accepted",
        md.safeUrl("data:image/jpeg;base64,AAAA") === "data:image/jpeg;base64,AAAA"
    );

    assert(
        "T10 data:image/png;base64 accepted",
        md.safeUrl("data:image/png;base64,BBBB") === "data:image/png;base64,BBBB"
    );

    assert(
        "T10 data:image/webp accepted",
        md.safeUrl("data:image/webp;base64,CCCC") === "data:image/webp;base64,CCCC"
    );

    assert(
        "T10 data:text/html rejected",
        md.safeUrl("data:text/html,<script>alert(1)</script>") === null
    );

    assert(
        "T10 data:text/javascript rejected",
        md.safeUrl("data:text/javascript,alert(1)") === null
    );

    assert(
        "T10 data:application/pdf rejected",
        md.safeUrl("data:application/pdf;base64,xxx") === null
    );

}


/* -----------------------------------------------------------
   TEST 11 — safeUrl: existing forbidden schemes still blocked.
----------------------------------------------------------- */

function testSafeUrlForbiddenSchemes() {

    assert(
        "T11 javascript: blocked",
        md.safeUrl("javascript:alert(1)") === null
    );

    assert(
        "T11 vbscript: blocked",
        md.safeUrl("vbscript:MsgBox(1)") === null
    );

    assert(
        "T11 blob: blocked",
        md.safeUrl("blob:https://example.com/xxx") === null
    );

    assert(
        "T11 file: blocked",
        md.safeUrl("file:///etc/passwd") === null
    );

    assert(
        "T11 http:// allowed",
        md.safeUrl("https://example.com/img.png") === "https://example.com/img.png"
    );

    assert(
        "T11 empty returns null",
        md.safeUrl("") === null
    );

    assert(
        "T11 null returns null",
        md.safeUrl(null) === null
    );

    assert(
        "T11 control chars blocked",
        md.safeUrl("https://example.com\u0001/img.png") === null
    );

    assert(
        "T11 null byte blocked",
        md.safeUrl("https://example.com\0/img.png") === null
    );

}


testSafeUrlDataImage();

testSafeUrlForbiddenSchemes();


/* -----------------------------------------------------------
   DOM shim + TEST 12 — Sanitizer render-level tests.

   These prove context-safe behavior: data:image/* is allowed
   in <img src> but stripped from <a href>.
   All other dangerous schemes remain blocked in both contexts.
----------------------------------------------------------- */

function testSanitizerContextSafety() {

    // Skip if no real document (Node without shim).
    // The shim below lets sanitize() run its DOM path.
    if (typeof document === "undefined") {

        // Minimal DOM shim for template.innerHTML parsing
        class ShimAttr {
            constructor(n, v) { this.name = n; this.value = v; }
        }

        class ShimEl {
            constructor(tag) {
                this.tagName = tag;
                this._attrs = [];
                this.children = [];
                this._innerHTML = "";
            }
            get attributes() { return this._attrs; }
            get childNodes() { return this.children; }
            get innerHTML() { return this._serialize(this); }
            set innerHTML(v) { this._innerHTML = v; this.children = this._parseChildren(v); }
            getAttribute(n) {
                const a = this._attrs.find(a => a.name === n);
                return a ? a.value : null;
            }
            hasAttribute(n) { return this._attrs.some(a => a.name === n); }
            setAttribute(n, v) {
                const a = this._attrs.find(a => a.name === n);
                if (a) a.value = v; else this._attrs.push(new ShimAttr(n, v));
            }
            removeAttribute(n) { this._attrs = this._attrs.filter(a => a.name !== n); }
            remove() {
                if (this._parent) {
                    this._parent.children = this._parent.children.filter(c => c !== this);
                }
            }
            replaceWith(...nodes) {
                if (this._parent) {
                    const i = this._parent.children.indexOf(this);
                    this._parent.children.splice(i, 1, ...nodes);
                    nodes.forEach(n => { if (n instanceof ShimEl) n._parent = this._parent; });
                }
            }
            _parseChildren(html) {
                const out = [];
                const VOID = new Set([
                    "IMG","BR","HR","INPUT","AREA","BASE","COL","LINK","META","PARAM","SOURCE","TRACK","WBR"
                ]);
                // Match closing-tag elements AND self-closing void elements
                const re = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>|<(\w+)([^>]*?)\/?>/g;
                let m;
                while ((m = re.exec(html))) {
                    const tag = (m[1] || m[4] || "").toUpperCase();
                    const attrStr = m[2] !== undefined ? m[2] : m[5];
                    const inner = m[3] !== undefined ? m[3] : "";
                    if (!tag) continue;
                    const el = new ShimEl(tag);
                    el._parent = this;
                    const attrRe = /(\w[\w-]*)(?:="([^"]*)")?/g;
                    let am;
                    while ((am = attrRe.exec(attrStr))) {
                        el._attrs.push(new ShimAttr(am[1], am[2] || ""));
                    }
                    if (!VOID.has(tag)) {
                        el.innerHTML = inner;
                    }
                    out.push(el);
                }
                return out;
            }
            _serialize(node) {
                let s = "";
                for (const c of node.children) {
                    s += "<" + c.tagName.toLowerCase();
                    for (const a of c._attrs) s += " " + a.name + '="' + a.value + '"';
                    s += ">" + this._serialize(c) + "</" + c.tagName.toLowerCase() + ">";
                }
                return s;
            }
        }

        globalThis.document = {
            createElement() {
                const el = new ShimEl("TEMPLATE");
                return {
                    set innerHTML(v) { el.innerHTML = v; },
                    get innerHTML() { return el.innerHTML; },
                    get content() { return el; }
                };
            }
        };
    }

    // img src: data:image/* must survive
    const imgJpeg = md.render('<img src="data:image/jpeg;base64,AAAA" alt="test">');
    assert(
        "T12 data:image/jpeg in <img src> preserved",
        imgJpeg.includes('src="data:image/jpeg;base64,AAAA"')
    );

    const imgPng = md.render('<img src="data:image/png;base64,BBBB" alt="pic">');
    assert(
        "T12 data:image/png in <img src> preserved",
        imgPng.includes('src="data:image/png;base64,BBBB"')
    );

    // img src: non-image data: must still be blocked
    const imgHtml = md.render('<img src="data:text/html,<script>alert(1)</script>">');
    assert(
        "T12 data:text/html in <img src> blocked",
        !imgHtml.includes("data:text/html")
    );

    // <a href>: all data: schemes must be stripped
    const aImgJpeg = md.render('<a href="data:image/jpeg;base64,AAAA">click</a>');
    assert(
        "T12 data:image/jpeg in <a href> stripped",
        !aImgJpeg.includes("data:image/jpeg") && aImgJpeg.includes("<a")
    );

    const aImgSvg = md.render('<a href="data:image/svg+xml,<script>alert(1)</script>">click</a>');
    assert(
        "T12 data:image/svg+xml in <a href> stripped",
        !aImgSvg.includes("data:image")
    );

    const aTextHtml = md.render('<a href="data:text/html,<script>alert(1)</script>">click</a>');
    assert(
        "T12 data:text/html in <a href> blocked",
        !aTextHtml.includes("data:")
    );

    const aTextJs = md.render('<a href="data:text/javascript,alert(1)">click</a>');
    assert(
        "T12 data:text/javascript in <a href> blocked",
        !aTextJs.includes("data:")
    );

    // <a href>: javascript/vbscript/blob/file still blocked
    const aJs = md.render('<a href="javascript:alert(1)">click</a>');
    assert(
        "T12 javascript: in <a href> blocked",
        !aJs.includes("javascript:")
    );

    const aVbs = md.render('<a href="vbscript:MsgBox(1)">click</a>');
    assert(
        "T12 vbscript: in <a href> blocked",
        !aVbs.includes("vbscript:")
    );

    const aBlob = md.render('<a href="blob:https://example.com/x">click</a>');
    assert(
        "T12 blob: in <a href> blocked",
        !aBlob.includes("blob:")
    );

    const aFile = md.render('<a href="file:///etc/passwd">click</a>');
    assert(
        "T12 file: in <a href> blocked",
        !aFile.includes("file:")
    );

    // <a href>: https still allowed
    const aHttps = md.render('<a href="https://example.com">click</a>');
    assert(
        "T12 https:// in <a href> allowed",
        aHttps.includes('href="https://example.com"')
    );

    // onclick stripped, href preserved when safe
    const aOnClick = md.render('<a href="https://safe.com" onclick="alert(1)">go</a>');
    assert(
        "T12 onclick stripped from <a>",
        !aOnClick.includes("onclick") && aOnClick.includes("https://safe.com")
    );

}

testSanitizerContextSafety();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}