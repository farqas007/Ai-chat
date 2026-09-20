/* ===========================================================
   AI CHAT
   File : terminalAgent.js
   Description : Terminal command execution (DISABLED for security).

   Arbitrary command execution via child_process.exec() is not
   safely usable in a production server. The exec path has been
   removed. runCommand() always returns a safe refusal message
   and never spawns a child process.
   =========================================================== */

export function runCommand(command) {

    return Promise.resolve("Terminal execution is disabled for security.");

}
