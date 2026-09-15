/* ===========================================================
   Regression tests for the code-block manager empty guard.

   The markdown renderer omits empty fenced blocks, but the
   model's raw-HTML path can still deliver an empty
   <pre class="code-block"><code></code></pre>. The CodeBlock
   manager must drop such blocks so no grey box with a useless
   Copy button is rendered, while keeping real, non-empty blocks
   (language label + Copy button intact).
=========================================================== */

function makeElement(tag, textContent, className) {

    return {
        tagName: tag,
        _text: textContent || "",
        className: className || "",
        children: [],
        parentElement: null,
        set textContent(value) { this._text = value; },
        get textContent() { return this._text; },
        addEventListener() {},
        appendChild(child) {
            child.parentElement = this;
            this.children.push(child);
        },
        insertBefore(child) {
            child.parentElement = this;
            this.children.push(child);
        },
        querySelector(selector) {
            return this.children.find(child =>
                (selector === ".copy-code" &&
                    child.className.includes("copy-code")) ||
                (selector === ".code-language" &&
                    child.className.includes("code-language"))
            ) || null;
        },
        remove() {
            if (this.parentElement) {
                const index =
                    this.parentElement.children.indexOf(this);
                if (index >= 0) {
                    this.parentElement.children.splice(index, 1);
                }
                this.parentElement = null;
            }
        }
    };

}


function block(text, className) {

    const pre = makeElement("pre", "", "code-block");
    const code = makeElement("code", text, className || "");
    pre.appendChild(code);
    return pre;

}


globalThis.document = {

    container: null,

    querySelectorAll: () => {

        return document.container.children
            .map(pre => pre.children.find(c => c.tagName === "code"));

    },

    createElement: tag => makeElement(tag)

};


import { CodeBlock } from "../js/codeblock.js";


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


/* -----------------------------------------------------------
   TEST 1 — An empty code block is removed from the DOM and is
   not tracked, but a real block survives with label + Copy.
----------------------------------------------------------- */

function testEmptyBlockRemoved() {

    document.container = makeElement("div");

    const empty = block("    ", "");
    const real = block("const a = 1;", "language-js");

    document.container.appendChild(empty);
    document.container.appendChild(real);

    const codeblock = new CodeBlock();

    const found = codeblock.findBlocks();

    assert(
        "E1 only the non-empty block is tracked",
        found.length === 1 &&
        codeblock.blocks.length === 1
    );

    assert(
        "E1 empty <pre> was removed from the DOM",
        !document.container.children.includes(empty)
    );

    assert(
        "E1 non-empty <pre> still present",
        document.container.children.includes(real)
    );


    codeblock.addCopyButtons();
    codeblock.addLanguageLabels();

    assert(
        "E1 Copy button on the real block",
        real.querySelector(".copy-code") !== null
    );

    assert(
        "E1 language label shows the real language",
        real.querySelector(".code-language") !== null &&
        real.querySelector(".code-language").textContent === "js"
    );

}


/* -----------------------------------------------------------
   TEST 2 — An empty block WITH a language class is still
   removed (no useless Copy button).
----------------------------------------------------------- */

function testEmptyWithLanguageRemoved() {

    document.container = makeElement("div");

    const empty =
        block("", "language-javascript");

    document.container.appendChild(empty);

    const codeblock = new CodeBlock();

    const found = codeblock.findBlocks();

    assert(
        "E2 empty with language not tracked",
        found.length === 0
    );

    assert(
        "E2 empty with language removed from DOM",
        !document.container.children.includes(empty)
    );

    codeblock.addCopyButtons();
    codeblock.addLanguageLabels();

    assert(
        "E2 no leftover Copy button anywhere",
        document.container
            .querySelector(".copy-code") === null
    );

}


/* -----------------------------------------------------------
   TEST 3 — Unlabelled non-empty block gets the default "text"
   label but its code is still copied.
----------------------------------------------------------- */

function testUnlabelledBlock() {

    document.container = makeElement("div");

    const plain = block("hello world", "");
    const empty = block("", "");

    document.container.appendChild(empty);
    document.container.appendChild(plain);

    const codeblock = new CodeBlock();
    codeblock.findBlocks();
    codeblock.addCopyButtons();
    codeblock.addLanguageLabels();

    assert(
        "E3 unlabelled kept block shows 'text' label",
        plain.querySelector(".code-language") !== null &&
        plain.querySelector(".code-language").textContent === "text"
    );

    assert(
        "E3 copy button reaches the actual code",
        plain.querySelector(".copy-code") !== null &&
        plain.children
            .find(c => c.tagName === "code")
            .textContent === "hello world"
    );

}


testEmptyBlockRemoved();

testEmptyWithLanguageRemoved();

testUnlabelledBlock();


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}