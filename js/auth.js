/* ===========================================================
   AI CHAT
   File : auth.js
   Description : Browser session authentication (login overlay).
   The access password is sent ONCE to /api/login over same-origin
   HTTPS. SERVER_API_TOKEN, OPENROUTER_API_KEY and REPLICATE_API_KEY
   are never exposed to JavaScript, HTML, localStorage or the bundle.
   After login the browser relies on the HttpOnly session cookie,
   which is sent automatically on same-origin requests.
   =========================================================== */


const overlay = document.getElementById("loginOverlay");

const form = document.getElementById("loginForm");

const passwordInput = document.getElementById("loginPassword");

const errorEl = document.getElementById("loginError");

const logoutBtn = document.getElementById("logoutBtn");


function showOverlay() {

    if (overlay) {

        overlay.classList.remove("hidden");

    }

}


function hideOverlay() {

    if (overlay) {

        overlay.classList.add("hidden");

    }

}


async function checkSession() {

    try {

        const response = await fetch("/api/session", { method: "GET" });

        const data = await response.json();

        return Boolean(data && data.authenticated);

    } catch (error) {

        return false;

    }

}


function setAuthenticatedUI(authenticated) {

    if (authenticated) {

        hideOverlay();

        if (logoutBtn) {

            logoutBtn.classList.remove("hidden");

        }

    } else {

        showOverlay();

        if (logoutBtn) {

            logoutBtn.classList.add("hidden");

        }

    }

}


export async function initAuth() {

    if (!overlay) {

        return;

    }

    setAuthenticatedUI(await checkSession());

    if (form) {

        form.addEventListener("submit", async event => {

            event.preventDefault();

            if (errorEl) {

                errorEl.textContent = "";

            }

            const password = passwordInput ? passwordInput.value : "";

            try {

                const response = await fetch("/api/login", {

                    method: "POST",

                    headers: { "Content-Type": "application/json" },

                    body: JSON.stringify({ password })

                });

                const data = await response.json().catch(() => ({}));

                if (response.ok && data.success) {

                    if (passwordInput) {

                        passwordInput.value = "";

                    }

                    setAuthenticatedUI(true);

                } else {

                    if (errorEl) {

                        errorEl.textContent = data.error || "Login failed";

                    }

                }

            } catch (error) {

                if (errorEl) {

                    errorEl.textContent = "Login failed. Check your connection.";

                }

            }

        });

    }

    if (logoutBtn) {

        logoutBtn.addEventListener("click", async () => {

            try {

                await fetch("/api/logout", { method: "POST" });

            } catch (error) {

                // Ignore; reload still clears the UI state.

            }

            window.location.reload();

        });

    }

}