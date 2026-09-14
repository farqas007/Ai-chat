import {
    extractFileName,
    extractKeyword,
    extractPatch,
    isSuspiciousPathToken
} from "../agent/taskParser.js";


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


// extractFileName
assert(
    "extractFileName finds index.html",
    extractFileName("Change the button text in index.html from Hello to Hi") === "index.html"
);

assert(
    "extractFileName finds nested js/app.js",
    extractFileName("update js/app.js to use the new API") === "js/app.js"
);

assert(
    "extractFileName finds pages/about.html",
    extractFileName("change the title in pages/about.html from About to Home") === "pages/about.html"
);

assert(
    "extractFileName returns null without a file extension",
    extractFileName("please update the login page") === null
);

assert(
    "extractFileName returns null for non-strings",
    extractFileName(undefined) === null &&
    extractFileName(42) === null
);


// extractPatch
assert(
    "extractPatch handles 'from X to Y'",
    JSON.stringify(extractPatch("Change the button text in index.html from Hello World to Welcome")) ===
    JSON.stringify({ oldCode: "Hello World", newCode: "Welcome" })
);

assert(
    "extractPatch handles 'replace X with Y'",
    JSON.stringify(extractPatch("replace Apple with Orange in fruits.txt")) ===
    JSON.stringify({ oldCode: "Apple", newCode: "Orange" })
);

assert(
    'extractPatch handles "from X to Y" with quotes',
    JSON.stringify(extractPatch('change "Hello" to "Hi" in index.html')) ===
    JSON.stringify({ oldCode: "Hello", newCode: "Hi" })
);

assert(
    "extractPatch returns null when no old/new content",
    extractPatch("update the login page to look nicer") === null
);


// extractKeyword
assert(
    "extractKeyword finds the login page keyword",
    extractKeyword("update the login page") === "login"
);


// isSuspiciousPathToken
assert(
    "detects '../' traversal",
    isSuspiciousPathToken("change ../escape.txt from A to B") === true
);

assert(
    "detects encoded traversal %2e",
    isSuspiciousPathToken("change in %2e%2e/escape.txt from A to B") === true
);

assert(
    "detects doubles-encoded traversal %252e",
    isSuspiciousPathToken("change in %252e%252e/escape.txt from A to B") === true
);

assert(
    "detects backslash paths",
    isSuspiciousPathToken("change C:\\evil.txt from A to B") === true
);

assert(
    "allows clean tasks",
    isSuspiciousPathToken("Change the button text in index.html from Hello to Hi") === false
);


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}