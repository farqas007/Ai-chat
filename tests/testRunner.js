/* ===========================================================
   Test runner: executes the REAL tests in tests/ as child
   processes and enforces their actual exit codes.

   A REAL test is one that asserts behavior and exits non-zero on
   failure (node:assert or a custom assert + process.exit(1)).
   All tests in tests/ have been converted to REAL assertion-based
   tests; the list below is the full set.

   Any non-zero exit, crash, or uncaught error from a real test
   aborts the run with a non-zero exit code.
   =========================================================== */


import { spawnSync } from "node:child_process";

import { fileURLToPath } from "node:url";

import path from "node:path";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.join(__dirname, "..");


/* Real assertion-based test files (each asserts and exits non-zero on failure). */

const REAL_TESTS = [
    "tests/testAIController.js",
    "tests/testAgent.js",
    "tests/testApiErrorHandling.js",
    "tests/testApiStreaming.js",
    "tests/testAuthFrontend.js",
    "tests/testAuthMiddleware.js",
    "tests/testAuthPolicy.js",
    "tests/testBackupManager.js",
    "tests/testChatErrorFlow.js",
    "tests/testChatDormantActions.js",
    "tests/testChatStorage.js",
    "tests/testChatStreamingIntegration.js",
    "tests/testChatSwitchRace.js",

    "tests/testChatSidebarFixes.js",
    "tests/testCodeBlockEmpty.js",
    "tests/testCodeExtractor.js",
    "tests/testCodexHandler.js",
    "tests/testConversation.js",
    "tests/testCreate.js",
    "tests/testDependencyAnalyzer.js",
    "tests/testDeployment.js",
    "tests/testDiffEngine.js",
    "tests/testDuplicateSubmitRace.js",
    "tests/testEditor.js",
    "tests/testFileAgentEdit.js",
    "tests/testFileReader.js",
    "tests/testFilesystem.js",
    "tests/testImageGenerator.js",

    "tests/testImagePersistence.js",
    "tests/testMarkdown.js",
    "tests/testMemory.js",
    "tests/testNaturalLanguageEdit.js",
    "tests/testPatch.js",
    "tests/testPatchPlanner.js",
    "tests/testPathGuard.js",
    "tests/testProjectIndexer.js",
    "tests/testRuntimePaths.js",
    "tests/testServerConfig.js",
    "tests/testServerRouteSecurity.js",
    "tests/testSettings.js",
    "tests/testSessionAuth.js",
    "tests/testStaticGuard.js",
    "tests/testStreamChat.js",
    "tests/testTaskParser.js",
    "tests/testTerminal.js",
    "tests/testThemeWiring.js",
    "tests/testToolManager.js",
    "tests/testVoiceComposer.js",
    "tests/testVoiceFixes.js",
    "tests/testVoiceInput.js",
    "tests/testVoiceSettings.js",
    "tests/testWorkerSessionAuth.js",
    "tests/testWorkerStreamChat.js"
];


let passed = 0;

let failed = 0;


for (const file of REAL_TESTS) {

    const result = spawnSync(
        process.execPath,
        [file],
        {
            cwd: repoRoot,
            encoding: "utf8"
        }
    );

    const output = ((result.stdout || "") + (result.stderr || "")).trim();

    const code = result.status;

    if (code === 0) {

        passed += 1;

        console.log(`PASS: ${file}`);

    } else {

        failed += 1;

        console.log(`FAIL: ${file} (exit code ${code})`);

        console.log(`--- output of ${file} ---`);

        console.log(output || "(no output)");

        console.log(`--- end output of ${file} ---`);

    }

}


console.log(`\nREAL TESTS: ${passed} passed, ${failed} failed`);


process.exit(failed > 0 ? 1 : 0);