import { isPublicPathname } from "../server/staticGuard.js";


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


const allowed = [
    "/",
    "/index.html",
    "/js/main.js",
    "/js/app.js",
    "/js/chat.js",
    "/css/style.css",
    "/css/chat.css",
    "/css/themes.css",
    "/css/media.css",
    "/js/ui.js",
    "/js/themes.js",
    "/js/index.html",
    "/css/index.html"
];

const blocked = [
    "/server/server.js",
    "/server/.env",
    "/server/authPolicy.js",
    "/server/staticGuard.js",
    "/.env",
    "/.env.example",
    "/memory/project-memory.json",
    "/backups/backup-test.txt.123.bak",
    "/bugs.json",
    "/memory.json",
    "/js",
    "/css",
    "/js/",
    "/css/",
    "/js/..",
    "/js/.",
    "/js/../server/server.js",
    "/../server/server.js",
    "/js/normal-file.js/../server/server.js",
    "/js/..%2fserver%2fserver.js",
    "/css/..%2fserver%2fserver.js",
    "/js/%2e%2e/server/server.js",
    "/js/%252e%252e/server/server.js",
    "/js/%2525252e%2525252e/server/server.js",
    "/js/%2e%2e/%2e%2e/server/server.js",
    "/js/%2e%2e%2f%2e%2e%2fserver%2fserver.js",
    "/js/%2e",
    "/js/%252e",
    "/js/%00",
    "/js/%2f",
    "/js/%25252f",
    "/js/file.js%00",
    "/js/index.html/../../../server/server.js",
    "/index.html/../server/server.js",
    "/static/js/main.js",
    "/js.\\..\\server\\server.js",
    "/js/%uff0e%uff0e/server/server.js"
];

allowed.forEach(p => {
    assert(`allows ${p}`, isPublicPathname(p) === true);
});

blocked.forEach(p => {
    assert(`blocks ${p}`, isPublicPathname(p) === false);
});


console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}