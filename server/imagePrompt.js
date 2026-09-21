/* ===========================================================
   AI CHAT
   File : imagePrompt.js
   Description : Shared /generate-image prompt validation.

   One implementation is used by both the Node server
   (server/server.js) and the Workers app (worker/index.js) so the
   two runtimes validate identically.

   A valid prompt must be a non-empty string. Non-string values
   (number, object, array, null) must be rejected as client input
   (400) instead of reaching the generic upstream error handler,
   which would surface them as a 502.
=========================================================== */

export const MAX_IMAGE_PROMPT_LENGTH = 2_048;

export function isValidImagePrompt(prompt) {

    return (
        typeof prompt === "string" &&
        prompt.trim().length > 0 &&
        prompt.length <= MAX_IMAGE_PROMPT_LENGTH
    );

}
