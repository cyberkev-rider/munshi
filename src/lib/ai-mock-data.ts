/**
 * Canned responses for MOCK_AI mode (see ai-config.ts's isMockMode). Lets
 * the entire voice capture -> transcribe -> extract -> confirm flow be
 * clicked through with no real Sarvam/Anthropic keys, e.g. for local UI
 * work or CI smoke tests. Every mock payload includes `mock: true` so
 * nothing pretends to be a real API response.
 */

import type { RawExtraction } from "./extract-helpers";

export const MOCK_TRANSCRIPT = "Ramesh ko paanch sau rupaye rupaye diye";
export const MOCK_LANGUAGE = "hi-IN";

/** The extraction the mock /api/extract route returns for the mock
 * transcript above: Ramesh / 500 rupees / paid, matching the spec's
 * first few-shot example exactly. */
export const MOCK_EXTRACTION: RawExtraction = {
  party: "Ramesh",
  amount_paise: 50_000,
  direction: "paid",
  note: "",
  confidence: 0.95,
};
