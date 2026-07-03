/**
 * Pure helper logic for the /api/extract route: cross-checking the LLM's
 * extracted amount against a deterministic parse of the transcript
 * (hindi-numbers.ts), fuzzy-matching an extracted party name against the
 * app's existing party list, and shaping the final ExtractResult the client
 * consumes.
 *
 * Kept separate from the route handler (route.ts) so this logic — which is
 * genuinely just data transformation, no I/O — can be unit tested directly
 * without spinning up a Next.js request/response cycle or mocking the
 * Anthropic SDK.
 */

import { parseLargestSpokenAmount } from "./hindi-numbers";

/** Shape the LLM's tool call returns (see route.ts's tool schema). */
export interface RawExtraction {
  party: string;
  amount_paise: number;
  direction: "paid" | "received";
  note: string;
  confidence: number;
}

/** Final shape returned to the client from /api/extract. */
export interface ExtractResult {
  party: string;
  /** True if `party` matched an existing party name (case-insensitive,
   * trimmed). False means the client should offer to create a new party. */
  partyMatched: boolean;
  amount_paise: number;
  direction: "paid" | "received";
  note: string;
  confidence: number;
  /** True if confidence is below the "trust it" threshold OR a required
   * field was missing/invalid — the client shows the confirm screen with
   * the affected field highlighted rather than auto-accepting. */
  needsReview: boolean;
  /** Set when the deterministic transcript parse disagreed with the LLM's
   * amount_paise, for transparency/debugging. Undefined when they agreed or
   * no number could be mechanically parsed from the transcript at all. */
  amountDisagreement?: {
    llmAmountPaise: number;
    deterministicAmountPaise: number;
  };
}

/** Confidence threshold below which the client must show the confirm screen
 * with a highlighted uncertain field rather than silently accepting the
 * parse. Matches the spec's "confidence < 0.7" rule. */
export const CONFIDENCE_REVIEW_THRESHOLD = 0.7;

/**
 * Cross-checks the LLM's amount_paise against a deterministic parse of the
 * raw transcript (hindi-numbers.ts). Per the spec, when the two disagree we
 * PREFER the deterministic value — arithmetic on spoken number words is
 * exactly the kind of mechanical task a regex-free parser gets right every
 * time, whereas an LLM can transpose digits or misparse compound scale
 * words ("do hazaar paanch sau" style) under load. We still surface the
 * disagreement to the caller (and lower confidence) so the confirm screen
 * can flag it for a human glance rather than silently overriding.
 *
 * Design choice (documented per the spec's request): DETERMINISTIC WINS on
 * disagreement, not the LLM. The LLM's value is only used when no
 * deterministic parse is possible at all (e.g. the transcript describes an
 * amount without speaking any recognizable number word structure, which
 * should be rare in this domain but isn't impossible with a noisy STT
 * transcript).
 */
export function crossCheckAmount(
  transcript: string,
  llmAmountPaise: number
): { amount_paise: number; disagreement?: ExtractResult["amountDisagreement"]; confidencePenalty: number } {
  const deterministic = parseLargestSpokenAmount(transcript);
  if (!deterministic) {
    // Nothing mechanically parseable — trust the LLM, no penalty.
    return { amount_paise: llmAmountPaise, confidencePenalty: 0 };
  }

  const deterministicPaise = Math.round(deterministic.rupees * 100);
  if (deterministicPaise === llmAmountPaise) {
    return { amount_paise: llmAmountPaise, confidencePenalty: 0 };
  }

  // Disagreement: prefer the deterministic parse, but flag it and knock
  // confidence down so the confirm screen highlights the amount field.
  return {
    amount_paise: deterministicPaise,
    disagreement: {
      llmAmountPaise,
      deterministicAmountPaise: deterministicPaise,
    },
    confidencePenalty: 0.3,
  };
}

/**
 * Fuzzy-matches an LLM-extracted party name against the app's existing
 * party list. Kept intentionally simple per the spec ("keep it simple"):
 * exact match (case/whitespace-insensitive) first, then a substring/prefix
 * check in either direction so "Ramesh bhai" matches an existing "Ramesh"
 * and vice versa. Returns the EXISTING party's canonical name when matched
 * (so the confirm screen shows/saves under the name already in the ledger,
 * not a variant spelling), or the LLM's raw name when no match is found.
 */
export function matchPartyName(
  extractedName: string,
  existingPartyNames: readonly string[]
): { name: string; matched: boolean } {
  const normalizedExtracted = extractedName.trim().toLowerCase();
  if (normalizedExtracted === "") {
    return { name: extractedName, matched: false };
  }

  // 1. Exact match (case/whitespace-insensitive).
  for (const existing of existingPartyNames) {
    if (existing.trim().toLowerCase() === normalizedExtracted) {
      return { name: existing, matched: true };
    }
  }

  // 2. Substring match in either direction ("Ramesh bhai" ~ "Ramesh").
  // Require the shorter string to be at least 3 characters to avoid
  // spurious matches on very short names.
  for (const existing of existingPartyNames) {
    const normalizedExisting = existing.trim().toLowerCase();
    if (normalizedExisting.length < 3 || normalizedExtracted.length < 3) continue;
    if (
      normalizedExtracted.includes(normalizedExisting) ||
      normalizedExisting.includes(normalizedExtracted)
    ) {
      return { name: existing, matched: true };
    }
  }

  return { name: extractedName.trim(), matched: false };
}

/**
 * Validates a raw LLM extraction has usable required fields. Returns a list
 * of problems (empty = all good). Used to force needsReview=true even when
 * the model reports high confidence but produced something unusable (e.g.
 * amount_paise <= 0, empty party name, invalid direction).
 */
export function validateExtraction(raw: Partial<RawExtraction>): string[] {
  const problems: string[] = [];
  if (!raw.party || raw.party.trim() === "") problems.push("party");
  if (typeof raw.amount_paise !== "number" || !Number.isFinite(raw.amount_paise) || raw.amount_paise <= 0) {
    problems.push("amount_paise");
  }
  if (raw.direction !== "paid" && raw.direction !== "received") problems.push("direction");
  return problems;
}

/**
 * Assembles the final ExtractResult from a raw LLM extraction, the original
 * transcript (for amount cross-checking), and the app's existing party
 * names (for fuzzy matching). This is the single place that combines all
 * three helpers above — the route handler calls this and returns the
 * result as JSON.
 */
export function buildExtractResult(
  raw: RawExtraction,
  transcript: string,
  existingPartyNames: readonly string[]
): ExtractResult {
  const problems = validateExtraction(raw);

  const { name, matched } = matchPartyName(raw.party ?? "", existingPartyNames);
  const { amount_paise, disagreement, confidencePenalty } = crossCheckAmount(
    transcript,
    raw.amount_paise ?? 0
  );

  const adjustedConfidence = Math.max(0, Math.min(1, (raw.confidence ?? 0) - confidencePenalty));
  const needsReview = problems.length > 0 || adjustedConfidence < CONFIDENCE_REVIEW_THRESHOLD;

  return {
    party: name,
    partyMatched: matched,
    amount_paise,
    direction: raw.direction === "paid" || raw.direction === "received" ? raw.direction : "paid",
    note: raw.note ?? "",
    confidence: adjustedConfidence,
    needsReview,
    amountDisagreement: disagreement,
  };
}
