/* ===========================================================
   Regression tests for the markdown renderer.

   F2: multiline fenced code blocks must keep their real line
       breaks (copying a code block returns the original code).
   F3: a fenced code language (```js) must be captured and
       rendered as a language-* class.
   F1: strings like "<p", "<table", "<ul" etc. must NOT trigger
       the raw-HTML path unless they form a complete HTML tag.
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


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}