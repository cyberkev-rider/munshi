/**
 * Server-side-only helpers shared by the /api/transcribe and /api/extract
 * route handlers: mock-mode detection and the structured error codes the
 * client turns into friendly Hindi/English messages.
 *
 * IMPORTANT: This module reads process.env directly and is only ever
 * imported from route handlers (server code). Never import this from a
 * "use client" file — API keys must never reach the browser bundle.
 */

/**
 * Mock mode lets the whole voice flow be exercised offline, without real
 * Sarvam/Anthropic keys: set MOCK_AI=1, or simply omit the relevant API key
 * in development (NODE_ENV !== "production"). In production, a missing key
 * always means a real 503 error — we never silently fall back to canned
 * data in prod.
 */
export function isMockMode(apiKeyPresent: boolean): boolean {
  if (process.env.MOCK_AI === "1") return true;
  if (process.env.NODE_ENV !== "production" && !apiKeyPresent) return true;
  return false;
}

/** Structured error codes returned by both AI routes. The client maps each
 * code to a friendly Hindi-first message (see i18n.ts's `voice.errors`). */
export type AiErrorCode =
  | "missing_api_key"
  | "upstream_error"
  | "invalid_audio"
  | "invalid_request"
  | "timeout";

export interface AiErrorBody {
  error: AiErrorCode;
  message: string;
}

/** Builds the JSON body for a structured error response. `message` is a
 * plain-English developer-facing detail (server logs / debugging) — it is
 * NOT shown to the end user; the client maps `error` to a localized string. */
export function aiError(error: AiErrorCode, message: string): AiErrorBody {
  return { error, message };
}

/** HTTP status to use for each error code. */
export function statusForError(code: AiErrorCode): number {
  switch (code) {
    case "missing_api_key":
      return 503;
    case "invalid_audio":
    case "invalid_request":
      return 400;
    case "timeout":
      return 504;
    case "upstream_error":
      return 502;
  }
}
