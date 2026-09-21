/* ===========================================================
   AI CHAT
   File : imageIntent.js
   Description : Detects image-generation intent from natural-
   language chat input and extracts a clean prompt.

   Supports English and Roman Urdu requests. Returns false for
   questions, troubleshooting, and ordinary chat messages.
=========================================================== */

const GENERATION_VERBS = new Set([
    "make", "making",
    "create", "creating",
    "generate", "generating",
    "draw",
    "design", "designing",
    "build", "building",
    "produce", "producing",
    "banao", "bana", "banaa", "banae", "banaen",
    "banaaen", "bna", "bnaa", "banado",
    "tayar", "taiyar"
]);

const VISUAL_NOUNS = new Set([
    "image", "images",
    "thumbnail", "thumbnails",
    "logo", "logos",
    "poster", "posters",
    "picture", "pictures",
    "photo", "photos", "photograph", "photographs",
    "drawing", "drawings",
    "wallpaper", "wallpapers",
    "artwork", "artworks",
    "painting", "paintings",
    "sketch", "sketches",
    "banner", "banners",
    "icon", "icons",
    "illustration", "illustrations",
    "graphic", "graphics",
    "tasveer", "tasveerein"
]);

const QUESTION_STARTS = [
    "how do i", "how do you", "how can i", "how can you",
    "how to", "how would",
    "what is", "what are", "what does", "what do",
    "what's", "whats",
    "why do", "why does", "why is", "why are",
    "can i", "could i",
    "should i", "should you",
    "would you", "will you",
    "where do", "where can", "where is",
    "when do", "when can", "when is",
    "is there", "are there",
    "do i", "do you", "does it",
    "kaise", "kaisa", "kaisi", "kaise karte",
    "kya", "kyun", "kyun ke", "kyunki",
    "kab", "kahan", "kaun",
    "kya hai", "kya hota", "kya karte",
    "kaise hota", "kyun hota",
    "batao", "batao mujhe", "samjhao", "samjhao mujhe",
    "mujhe batao", "mujhe samjhao"
];

const TROUBLESHOOTING = [
    "error", "not loading", "broken", "bug", "issue",
    "problem", "fail", "failed", "failing", "crash",
    "doesn't work", "doesnt work", "not working",
    "kaam nahi", "kaam nahi kar", "toot gaya", "kharab"
];

const DESCRIBING_PREFIXES = [
    "i can ", "i could ", "i would ",
    "i want to learn", "i need help",
    "this script", "this tool", "my code",
    "the script", "the tool"
];

const TOOL_CONTEXTS = [
    "using html", "using css", "using javascript",
    "using photoshop", "using figma", "using canva",
    "in html", "in css", "in javascript",
    "in photoshop", "in figma", "in canva",
    "with html", "with css"
];

const INFO_VERBS = ["explain", "tell", "describe", "show", "teach", "help"];

const FILLER_WORDS = /\b(mujhe|mera|meri|mere|tum|aap|please|plz|ab|ye|wo|ek|do|karo|kijiye|me|can|could|would|will|you)\b/gi;
const BANA_PATTERNS = /\b(banaa\s+do|bana\s+do|bnaa\s+do|bna\s+do|banado|banaaen|banao|banae|banaa|bana|bnaa|bna)\b/gi;
const LEADING_PREPOSITIONS = /^(of|for|of a|of an|of the|for a|for an|for the)\s+/i;

/**
 * Detects whether a chat message expresses image-generation intent.
 *
 * Requires BOTH a generation verb AND a visual noun to be present.
 * Questions and troubleshooting messages are always rejected.
 *
 * @param {string} text - The user's chat message.
 * @returns {boolean}
 */
export function isImageGenerationIntent(text) {
    if (typeof text !== "string") {
        return false;
    }

    const normalized = text.toLowerCase().trim();

    if (normalized.length < 3) {
        return false;
    }

    const words = normalized.split(/\s+/);

    /* Reject questions and troubleshooting messages. */
    for (const start of QUESTION_STARTS) {
        if (normalized.startsWith(start + " ") || normalized === start) {
            return false;
        }
    }

    for (const phrase of TROUBLESHOOTING) {
        if (normalized.includes(phrase)) {
            return false;
        }
    }

    /* Reject descriptive/informational statements. */
    for (const prefix of DESCRIBING_PREFIXES) {
        if (normalized.startsWith(prefix)) {
            return false;
        }
    }

    /* Reject tool-context messages. */
    for (const context of TOOL_CONTEXTS) {
        if (normalized.includes(context)) {
            return false;
        }
    }

    /* Handle "can you"/"could you" — reject info questions,
       allow action requests through to verb/noun check. */
    const politePrefixes = ["can you", "could you"];
    for (const prefix of politePrefixes) {
        if (normalized.startsWith(prefix + " ") || normalized === prefix) {
            const after = normalized.slice(prefix.length).trim();
            const firstWord = after.split(/\s+/)[0];
            if (INFO_VERBS.includes(firstWord)) {
                return false;
            }
            break;
        }
    }

    /* Require a generation verb. */
    const hasVerb = words.some(w => GENERATION_VERBS.has(w));
    if (!hasVerb) {
        return false;
    }

    /* Require a visual noun. */
    const hasNoun = words.some(w => VISUAL_NOUNS.has(w));
    if (!hasNoun) {
        return false;
    }

    /* Extract and validate the prompt. */
    const prompt = extractImagePrompt(text);
    return prompt.length > 0;
}

/**
 * Extracts a clean image-generation prompt from the user's message.
 * Strips conversational filler and action phrases, preserving the
 * visual description.
 *
 * @param {string} text - The user's chat message.
 * @returns {string} The extracted prompt, or "" if nothing useful remains.
 */
export function extractImagePrompt(text) {
    if (typeof text !== "string") {
        return "";
    }

    let prompt = text.toLowerCase().trim();

    if (prompt.length === 0) {
        return "";
    }

    /* Strip "bana do / banaa do / banao / bana / banaa" action phrases. */
    prompt = prompt.replace(BANA_PATTERNS, " ");

    /* Strip Roman Urdu filler words. */
    prompt = prompt.replace(FILLER_WORDS, " ");

    /* Strip English generation verbs (not visual nouns). */
    prompt = prompt.replace(
        /\b(make|making|create|creating|generate|generating|draw|design|designing|build|building|produce|producing)\b/gi,
        " "
    );

    /* Strip common English filler words and prepositions. */
    prompt = prompt.replace(
        /\b(an?|the|of|for|my|with|a|please|plz|want|wants|need)\b/gi,
        " "
    );

    /* Strip leading prepositions. */
    prompt = prompt.replace(LEADING_PREPOSITIONS, " ");

    /* Collapse whitespace and trim. */
    prompt = prompt.replace(/\s+/g, " ").trim();

    return prompt;
}
