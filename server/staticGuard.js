/* ===========================================================
   AI CHAT
   File : staticGuard.js
   Description : Static asset path guard (pure, no express dependency)
   =========================================================== */

/* Public assets are ONLY:
 *   - "/"  (index page)
 *   - "/index.html"
 *   - "/css/<plain-filename>"
 *   - "/js/<plain-filename>"
 *
 * The guard is intentionally DECODE-FREE. express.static performs its
 * own URL decoding further down the pipeline, so any percent-encoded
 * input ("%2e", "%252e", "%2e%2e", ...) is rejected outright on the raw
 * path. Because no encoded character can reach the static middleware,
 * the downstream decoder has nothing to turn back into ".." and encoded
 * traversal is structurally impossible, no matter how many decode layers
 * exist.
 */

const SAFE_FILE = /^[A-Za-z0-9._-]+$/;

export function isPublicPathname(pathname) {

    if (typeof pathname !== "string" || pathname === "") {
        return false;
    }

    if (pathname === "/" || pathname === "/index.html") {
        return true;
    }

    // Reject any encoded character. No legitimate asset needs encoding.
    if (pathname.includes("%")) {
        return false;
    }

    if (!pathname.startsWith("/")) {
        return false;
    }

    const segments = pathname.slice(1).split("/");

    // Exactly one directory level plus one filename: /css/x or /js/x.
    if (segments.length !== 2) {
        return false;
    }

    const [dir, file] = segments;

    if (dir !== "css" && dir !== "js") {
        return false;
    }

    if (file.length === 0 || file === "." || file === "..") {
        return false;
    }

    return SAFE_FILE.test(file);
}