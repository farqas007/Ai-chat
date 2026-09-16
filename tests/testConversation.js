import assert from "node:assert";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    saveConversation,
    loadConversation
} from "../memory/conversationMemory.js";


const originalCwd = process.cwd();

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "testConversation-"));

const repoMemoryFile = path.join(originalCwd, "memory", "conversation-memory.json");

const repoMemoryBefore = fs.existsSync(repoMemoryFile)
    ? fs.readFileSync(repoMemoryFile, "utf8")
    : null;


try {

    process.chdir(tmpDir);

    fs.mkdirSync("memory", { recursive: true });


    assert.deepStrictEqual(
        loadConversation(),
        [],
        "no saved history must load as an empty array"
    );


    saveConversation("User likes Urdu AI assistant");

    saveConversation("User is building AI Chat project");


    const history = loadConversation();

    assert.strictEqual(
        history.length,
        2,
        "two saved messages must be retrieved"
    );

    assert.strictEqual(
        history[0].message,
        "User likes Urdu AI assistant",
        "first message must be preserved in order"
    );

    assert.strictEqual(
        history[1].message,
        "User is building AI Chat project",
        "second message must be preserved in order"
    );

    assert.ok(
        typeof history[0].time === "string" && history[0].time.length > 0,
        "each entry must carry a time stamp"
    );

    assert.ok(
        fs.existsSync(
            path.join(tmpDir, "memory", "conversation-memory.json")
        ),
        "history must be written inside the isolated temporary location"
    );


    const repoMemoryAfter = fs.existsSync(repoMemoryFile)
        ? fs.readFileSync(repoMemoryFile, "utf8")
        : null;

    assert.strictEqual(
        repoMemoryAfter,
        repoMemoryBefore,
        "repository conversation memory must not be altered"
    );


    console.log("PASS: conversation stores and retrieves messages in isolation");

}
finally {

    process.chdir(originalCwd);

    fs.rmSync(tmpDir, { recursive: true, force: true });

}