/* ===========================================================
   Tests for image-generation intent detection (js/imageIntent.js).

   Verifies that natural-language chat requests expressing image-
   generation intent are correctly detected and that the prompt
   is extracted cleanly. Also verifies that questions, troubleshooting,
   and ordinary chat messages are NOT intercepted.
=========================================================== */

import {
    isImageGenerationIntent,
    extractImagePrompt
} from "../js/imageIntent.js";


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
   1. English positive cases — should detect intent.
----------------------------------------------------------- */

assert("english: make an image of a sunset",
    isImageGenerationIntent("make an image of a sunset") === true);

assert("english: create an image of a gaming setup",
    isImageGenerationIntent("create an image of a gaming setup") === true);

assert("english: generate a thumbnail for my YouTube video",
    isImageGenerationIntent("generate a thumbnail for my YouTube video") === true);

assert("english: make me a thumbnail",
    isImageGenerationIntent("make me a thumbnail") === true);

assert("english: draw a logo for my brand",
    isImageGenerationIntent("draw a logo for my brand") === true);

assert("english: create a banner for my website",
    isImageGenerationIntent("create a banner for my website") === true);

assert("english: generate a picture of a cat",
    isImageGenerationIntent("generate a picture of a cat") === true);

assert("english: make a wallpaper with mountains",
    isImageGenerationIntent("make a wallpaper with mountains") === true);

assert("english: design an icon for my app",
    isImageGenerationIntent("design an icon for my app") === true);

assert("english: produce a sketch of a house",
    isImageGenerationIntent("produce a sketch of a house") === true);

assert("english: build me a graphic for the event",
    isImageGenerationIntent("build me a graphic for the event") === true);

assert("english: create an illustration of a dragon",
    isImageGenerationIntent("create an illustration of a dragon") === true);


/* -----------------------------------------------------------
   2. Roman Urdu positive cases — should detect intent.
----------------------------------------------------------- */

assert("urdu: mujhe dhamaal ka thumbnail banaa do",
    isImageGenerationIntent("mujhe dhamaal ka thumbnail banaa do") === true);

assert("urdu: ek logo bana do",
    isImageGenerationIntent("ek logo bana do") === true);

assert("urdu: poster bana do",
    isImageGenerationIntent("poster bana do") === true);

assert("urdu: image bana do",
    isImageGenerationIntent("image bana do") === true);

assert("urdu: picture banaa do",
    isImageGenerationIntent("picture banaa do") === true);

assert("urdu: mujhe ek thumbnail bana do",
    isImageGenerationIntent("mujhe ek thumbnail bana do") === true);

assert("urdu: ek drawing banao",
    isImageGenerationIntent("ek drawing banao") === true);

assert("urdu: mujhe wallpaper banao",
    isImageGenerationIntent("mujhe wallpaper banao") === true);

assert("urdu: photo bana do",
    isImageGenerationIntent("photo bana do") === true);

assert("urdu: tasveer bana do",
    isImageGenerationIntent("tasveer bana do") === true);


/* -----------------------------------------------------------
   3. Mixed language cases.
----------------------------------------------------------- */

assert("mixed: make me ek thumbnail",
    isImageGenerationIntent("make me ek thumbnail") === true);

assert("mixed: ek gaming setup ki image create karo",
    isImageGenerationIntent("ek gaming setup ki image create karo") === true);

assert("mixed: please ek logo design karo",
    isImageGenerationIntent("please ek logo design karo") === true);


/* -----------------------------------------------------------
   4. Extraction tests — verify clean prompt extraction.
----------------------------------------------------------- */

assert("extract: mujhe dhamaal ka thumbnail banaa do -> dhamaal ka thumbnail",
    extractImagePrompt("mujhe dhamaal ka thumbnail banaa do") === "dhamaal ka thumbnail");

assert("extract: ek logo bana do -> logo",
    extractImagePrompt("ek logo bana do") === "logo");

assert("extract: make an image of a sunset -> image sunset",
    extractImagePrompt("make an image of a sunset") === "image sunset");

assert("extract: generate a thumbnail for my YouTube video -> thumbnail youtube video",
    extractImagePrompt("generate a thumbnail for my YouTube video") === "thumbnail youtube video");

assert("extract: create an illustration of a dragon -> illustration dragon",
    extractImagePrompt("create an illustration of a dragon") === "illustration dragon");

assert("extract: draw a logo for my brand -> logo brand",
    extractImagePrompt("draw a logo for my brand") === "logo brand");

assert("extract: mujhe ek thumbnail bana do -> thumbnail",
    extractImagePrompt("mujhe ek thumbnail bana do") === "thumbnail");

assert("extract: picture banaa do -> picture",
    extractImagePrompt("picture banaa do") === "picture");

assert("extract: photo bana do -> photo",
    extractImagePrompt("photo bana do") === "photo");

assert("extract: poster bana do -> poster",
    extractImagePrompt("poster bana do") === "poster");

assert("extract: make me a wallpaper with mountains -> wallpaper mountains",
    extractImagePrompt("make me a wallpaper with mountains") === "wallpaper mountains");

assert("extract: design an icon for my app -> icon app",
    extractImagePrompt("design an icon for my app") === "icon app");


/* -----------------------------------------------------------
   5. Empty / invalid input.
----------------------------------------------------------- */

assert("empty string -> no intent",
    isImageGenerationIntent("") === false);

assert("null -> no intent",
    isImageGenerationIntent(null) === false);

assert("undefined -> no intent",
    isImageGenerationIntent(undefined) === false);

assert("number -> no intent",
    isImageGenerationIntent(123) === false);

assert("empty string -> empty prompt",
    extractImagePrompt("") === "");

assert("null -> empty prompt",
    extractImagePrompt(null) === "");

assert("whitespace only -> no intent",
    isImageGenerationIntent("   ") === false);


/* -----------------------------------------------------------
   6. Question / explanation negative cases — must NOT trigger.
----------------------------------------------------------- */

assert("negative: how do I make a thumbnail?",
    isImageGenerationIntent("how do I make a thumbnail?") === false);

assert("negative: what is a thumbnail?",
    isImageGenerationIntent("what is a thumbnail?") === false);

assert("negative: how can I create an image in Photoshop?",
    isImageGenerationIntent("how can I create an image in Photoshop?") === false);

assert("negative: explain how image generation works",
    isImageGenerationIntent("explain how image generation works") === false);

assert("negative: why does my image have an error",
    isImageGenerationIntent("why does my image have an error") === false);

assert("negative: what are thumbnails used for",
    isImageGenerationIntent("what are thumbnails used for") === false);

assert("negative: can you tell me about logos",
    isImageGenerationIntent("can you tell me about logos") === false);

assert("negative: kya hai thumbnail",
    isImageGenerationIntent("kya hai thumbnail") === false);

assert("negative: kaise banao image",
    isImageGenerationIntent("kaise banao image") === false);

assert("negative: samjhao image generation",
    isImageGenerationIntent("samjhao image generation") === false);


/* -----------------------------------------------------------
   7. Technical troubleshooting negative cases.
----------------------------------------------------------- */

assert("negative: my image has an error",
    isImageGenerationIntent("my image has an error") === false);

assert("negative: the thumbnail is not loading",
    isImageGenerationIntent("the thumbnail is not loading") === false);

assert("negative: image not working",
    isImageGenerationIntent("image not working") === false);

assert("negative: logo broken",
    isImageGenerationIntent("logo broken") === false);

assert("negative: photo kaam nahi kar raha",
    isImageGenerationIntent("photo kaam nahi kar raha") === false);


/* -----------------------------------------------------------
   8. Ordinary chat messages — must NOT trigger.
----------------------------------------------------------- */

assert("negative: hello how are you",
    isImageGenerationIntent("hello how are you") === false);

assert("negative: what is the weather today",
    isImageGenerationIntent("what is the weather today") === false);

assert("negative: tell me a joke",
    isImageGenerationIntent("tell me a joke") === false);

assert("negative: write me a poem about love",
    isImageGenerationIntent("write me a poem about love") === false);

assert("negative: help me with my homework",
    isImageGenerationIntent("help me with my homework") === false);

assert("negative: mujhe kya karna chahiye",
    isImageGenerationIntent("mujhe kya karna chahiye") === false);

assert("negative: aap kaise hain",
    isImageGenerationIntent("aap kaise hain") === false);

assert("negative: code likho javascript mein",
    isImageGenerationIntent("code likho javascript mein") === false);

assert("negative: summarise this article",
    isImageGenerationIntent("summarise this article") === false);

assert("negative: translate this to english",
    isImageGenerationIntent("translate this to english") === false);


/* -----------------------------------------------------------
   9. Edge cases: visual noun without generation verb.
----------------------------------------------------------- */

assert("negative: I like the thumbnail",
    isImageGenerationIntent("I like the thumbnail") === false);

assert("negative: this image is beautiful",
    isImageGenerationIntent("this image is beautiful") === false);

assert("negative: the logo looks great",
    isImageGenerationIntent("the logo looks great") === false);


/* -----------------------------------------------------------
   10. Edge cases: generation verb without visual noun.
----------------------------------------------------------- */

assert("negative: make me a sandwich",
    isImageGenerationIntent("make me a sandwich") === false);

assert("negative: create a new file",
    isImageGenerationIntent("create a new file") === false);

assert("negative: generate a report",
    isImageGenerationIntent("generate a report") === false);

assert("negative: draw a conclusion",
    isImageGenerationIntent("draw a conclusion") === false);


/* -----------------------------------------------------------
   11. Descriptive/instrumental false-positive cases.
       These describe ability, past actions, or tool context
       and must NOT trigger image generation.
----------------------------------------------------------- */

assert("negative: I can make a thumbnail in CSS",
    isImageGenerationIntent("I can make a thumbnail in CSS") === false);

assert("negative: I want to learn how to make a thumbnail",
    isImageGenerationIntent("I want to learn how to make a thumbnail") === false);

assert("negative: I made a thumbnail yesterday",
    isImageGenerationIntent("I made a thumbnail yesterday") === false);

assert("negative: I created a logo in Photoshop",
    isImageGenerationIntent("I created a logo in Photoshop") === false);

assert("negative: I need help creating a thumbnail",
    isImageGenerationIntent("I need help creating a thumbnail") === false);

assert("negative: This script can create a logo",
    isImageGenerationIntent("This script can create a logo") === false);

assert("negative: make a thumbnail using HTML and CSS",
    isImageGenerationIntent("make a thumbnail using HTML and CSS") === false);

assert("negative: a generated image looks bad",
    isImageGenerationIntent("a generated image looks bad") === false);

assert("negative: she created a poster for the event",
    isImageGenerationIntent("she created a poster for the event") === false);

assert("negative: the designer made a logo",
    isImageGenerationIntent("the designer made a logo") === false);


/* -----------------------------------------------------------
   12. Polite action requests — SHOULD trigger.
       "can you"/"could you" + action verb is a request,
       not an informational question.
----------------------------------------------------------- */

assert("polite: can you make me a thumbnail",
    isImageGenerationIntent("can you make me a thumbnail") === true);

assert("polite: could you create a logo for me",
    isImageGenerationIntent("could you create a logo for me") === true);

assert("polite: can you draw a picture of a sunset",
    isImageGenerationIntent("can you draw a picture of a sunset") === true);

assert("polite: could you generate a thumbnail",
    isImageGenerationIntent("could you generate a thumbnail") === true);

assert("polite: can you design a poster",
    isImageGenerationIntent("can you design a poster") === true);


/* -----------------------------------------------------------
   13. Polite information questions — must NOT trigger.
       "can you"/"could you" + info verb is a question.
----------------------------------------------------------- */

assert("negative: can you explain how to generate a thumbnail?",
    isImageGenerationIntent("can you explain how to generate a thumbnail?") === false);

assert("negative: can you tell me what a thumbnail is?",
    isImageGenerationIntent("can you tell me what a thumbnail is?") === false);

assert("negative: could you explain image generation?",
    isImageGenerationIntent("could you explain image generation?") === false);


/* -----------------------------------------------------------
   14. "would you" / "will you" — must NOT trigger.
       These are question forms, not requests.
----------------------------------------------------------- */

assert("negative: would you draw a picture",
    isImageGenerationIntent("would you draw a picture") === false);

assert("negative: will you design a poster",
    isImageGenerationIntent("will you design a poster") === false);


/* -----------------------------------------------------------
   15. Roman Urdu abbreviated variants — should trigger.
----------------------------------------------------------- */

assert("urdu: thumbnail bna do",
    isImageGenerationIntent("thumbnail bna do") === true);

assert("urdu: thumbnail bnaa do",
    isImageGenerationIntent("thumbnail bnaa do") === true);

assert("urdu: thumbnail banado",
    isImageGenerationIntent("thumbnail banado") === true);

assert("urdu: mujhe logo bna do",
    isImageGenerationIntent("mujhe logo bna do") === true);


/* -----------------------------------------------------------
   16. Extraction for polite requests and URDU variants.
----------------------------------------------------------- */

assert("extract: can you make me a thumbnail -> thumbnail",
    extractImagePrompt("can you make me a thumbnail") === "thumbnail");

assert("extract: could you create a logo for me -> logo",
    extractImagePrompt("could you create a logo for me") === "logo");

assert("extract: thumbnail bna do -> thumbnail",
    extractImagePrompt("thumbnail bna do") === "thumbnail");

assert("extract: thumbnail bnaa do -> thumbnail",
    extractImagePrompt("thumbnail bnaa do") === "thumbnail");

assert("extract: thumbnail banado -> thumbnail",
    extractImagePrompt("thumbnail banado") === "thumbnail");

assert("extract: mujhe logo bna do -> logo",
    extractImagePrompt("mujhe logo bna do") === "logo");


/* -----------------------------------------------------------
   Summary
----------------------------------------------------------- */

console.log(`\n${passed.length} passed, ${failed.length} failed`);

if (failed.length > 0) {
    process.exit(1);
}
