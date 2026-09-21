/* ===========================================================
   AI CHAT
   File : codexHandler.js
   Description : /codex request handling (pure, no express)
   =========================================================== */

import { isSafeEditPath } from "./pathGuard.js";

const ALLOWED_ACTIONS = ["create", "edit"];

function isFileOperation(body) {
    return (
        typeof body === "object" &&
        body !== null &&
        !Array.isArray(body) &&
        typeof body.action === "string" &&
        typeof body.file === "string"
    );
}

function mapFileResult(result, file) {

    if (!result) {
        return {
            status: 500,
            json: {
                success: false,
                error: "File operation failed"
            }
        };
    }

    if (!result.success) {

        const error = result.error || result.message || "File operation failed";

        let status = 500;

        if (
            error === "Invalid file path" ||
            error === "Access denied" ||
            error === "Sensitive path"
        ) {
            status = 403;
        } else if (error === "File not found") {
            status = 404;
        } else if (
            error === "Old code not found" ||
            error === "No edit content provided"
        ) {
            status = 400;
        }

        return {
            status,
            json: {
                success: false,
                error,
                file
            }
        };
    }

    return {
        status: 200,
        json: {
            success: true,
            file: result.file || file,
            message: result.message || "File operation completed"
        }
    };
}

// Resolves a POST /codex request body. Returns { status, json }.
// Preserves the original "task" pipeline and, in addition, accepts a
// direct, sandboxed file operation: { action, file, content, oldCode, newCode }.
export async function handleCodexRequest(body, codex) {

    const payload = (typeof body === "object" && body !== null)
        ? body
        : {};

    // Direct create/edit of an intended project file.
    if (isFileOperation(payload)) {

        const { action, file, content, oldCode, newCode } = payload;

        if (
            (content !== undefined && typeof content !== "string") ||
            (oldCode !== undefined && typeof oldCode !== "string") ||
            (newCode !== undefined && typeof newCode !== "string")
        ) {
            return {
                status: 400,
                json: {
                    success: false,
                    error: "content, oldCode, and newCode must be strings"
                }
            };
        }

        if (!ALLOWED_ACTIONS.includes(action)) {
            return {
                status: 400,
                json: {
                    success: false,
                    error: "Unknown file action"
                }
            };
        }

        if (!isSafeEditPath(file)) {
            return {
                status: 403,
                json: {
                    success: false,
                    error: "Access denied"
                }
            };
        }

        let result;
        try {
            result = codex.files.execute({
                action,
                file,
                content,
                oldCode,
                newCode
            });
        } catch (error) {
            return {
                status: 500,
                json: {
                    success: false,
                    error: error.message === "File not found" ||
                           error.message === "Invalid file path" ||
                           error.message === "Sensitive path"
                        ? error.message
                        : "File operation failed"
                }
            };
        }

        return mapFileResult(result, file);
    }

    // Original natural-language task pipeline.
    const task = typeof payload.task === "string"
        ? payload.task.trim()
        : "";

    if (!task) {
        return {
            status: 400,
            json: {
                success: false,
                error: "Task required"
            }
        };
    }

    const result = await codex.run(task);

    // Never report a fake success: surface a graph that contains failed steps.
    const failedStep = (Array.isArray(result) ? result : [])
        .find(step =>
            step &&
            (
                step.status === "failed" ||
                (step.result && step.result.success === false)
            )
        );

    if (failedStep) {
        return {
            status: 400,
            json: {
                success: false,
                error: "Task could not be completed",
                result
            }
        };
    }

    return {
        status: 200,
        json: {
            success: true,
            result
        }
    };
}