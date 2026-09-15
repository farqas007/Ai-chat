/* ===========================================================
   AI CHAT
   File : upstreamErrors.js
   Description : Safe upstream (provider) error handling for the
   server. The server never echoes provider internals, stack
   traces or internal paths back to the client. Detailed errors
   are logged server-side only; clients receive clean messages.
=========================================================== */

export class UpstreamHttpError extends Error {

    constructor(status, message) {
        super(message);
        this.name = "UpstreamHttpError";
        this.status = status;
    }

}

// Reads an upstream response body safely. JSON and non-JSON
// responses are both handled; parse failures never crash the
// handler, and a non-2xx status always yields UpstreamHttpError.
export async function readUpstreamJson(response) {

    const text = await response.text();

    let data = null;

    try {
        data = text ? JSON.parse(text) : null;
    }
    catch {
        data = null;
    }

    if (!response.ok) {
        throw new UpstreamHttpError(
            response.status,
            data?.error?.message ||
            data?.error ||
            data?.message ||
            data?.detail ||
            data?.title ||
            "Upstream request failed"
        );
    }

    return data;

}

export function upstreamErrorMessage(status) {

    if (status === 400 || status === 404 || status === 422) {
        return "The provider rejected the request.";
    }

    if (status === 401 || status === 403) {
        return "The provider refused authentication.";
    }

    if (status === 429) {
        return "The provider is rate-limited. Please try again shortly.";
    }

    if (status >= 500) {
        return "The provider is temporarily unavailable. Please try again.";
    }

    return "Upstream request failed. Please try again.";

}

// Maps an upstream failure to a safe HTTP status + clean message.
export function handleUpstreamError(error) {

    if (error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        return { status: 504, message: "Upstream timed out. Please try again." };
    }

    if (error instanceof UpstreamHttpError) {
        return {
            status: error.status,
            message: upstreamErrorMessage(error.status)
        };
    }

    if (error instanceof TypeError) {
        return {
            status: 502,
            message: "Could not reach the provider. Please try again."
        };
    }

    return {
        status: 502,
        message: "Upstream request failed. Please try again."
    };

}

// Generic, safe client message for internal handler failures.
export const GENERIC_SERVER_ERROR = "Something went wrong. Please try again.";