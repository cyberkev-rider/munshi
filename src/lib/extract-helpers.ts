/**
 * Pure helper logic for the /api/extract route: cross-checking the LLM's
 * extracted amount against a deterministic parse of the transcript
 * (hindi-numbers.ts), resolving an extracted party name against the app's
 * existing party list (the model's own existing_party guess when it's an
 * exact list member, else a local fuzzy match), sanitizing stray junk out
 * of model-produced text fields, and shaping the final ExtractResult the
 * client consumes.
 *
 * Kept separate from the route handler (route.ts) so this logic — which is
 * genuinely just data transformation, no I/O — can be unit tested directly
 * without spinning up a Next.js request/response cycle or mocking the
 * Anthropic SDK.
 */

import { parseLargestSpokenAmount } from "./hindi-numbers";
import { acceptExistingParty } from "./party-match";

/** Shape of the LLM's structured-output JSON (see route.ts's output
 * schema). */
export interface RawExtraction {
  party: string;
  /** The model's own best guess at which existing party (if any) this is
   * — see src/lib/party-match.ts. Only ever trusted when it EXACTLY
   * matches a member of the caller's existingPartyNames; buildExtractResult
   * falls back to matchPartyName below otherwise. */
  existing_party: string;
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
 * Matches an HTML/XML-ish tag-like fragment: "<foo>", "</foo>", or a
 * malformed one like "</antmlःparameter>" — including when the "tag name"
 * contains non-ASCII characters. Guards against a real failure mode seen
 * in live testing: a forced-tool-call empty-string serialization glitch
 * that occasionally leaked a stray closing-tag fragment into a string
 * parameter instead of a genuine empty string. Deliberately simple (any
 * `<...>`-shaped run with no internal whitespace) — this domain (spoken
 * Hindi/Hinglish bookkeeping notes) never legitimately contains literal
 * angle-bracket markup, so there's no real content this could clobber.
 */
const TAG_LIKE_PATTERN = /<\/?[^\s<>][^<>]*>/gu;

/**
 * Defensive last-line sanitizer for a model-produced string field (party or
 * note): strips any tag-like fragment (see TAG_LIKE_PATTERN), collapses any
 * resulting run of whitespace to a single space, and trims. A pure
 * function — legitimate content (Devanagari, Hinglish, punctuation) that
 * never happens to look like a tag passes through completely unchanged.
 * null/undefined are treated as an empty string.
 */
export function sanitizeModelText(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(TAG_LIKE_PATTERN, " ").replace(/\s+/g, " ").trim();
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
 * names (for matching). This is the single place that combines all the
 * helpers above — the route handler calls this and returns the result as
 * JSON.
 *
 * Party resolution order: (1) if the model's own existing_party guess
 * EXACTLY matches (case-insensitively) a member of existingPartyNames,
 * trust it and use that member's canonical spelling — this is what lets a
 * cross-script/differently-spelled/honorific-carrying spoken name (e.g.
 * Devanagari "सुरेश") resolve to an existing Latin-spelled party. (2)
 * Otherwise fall back to matchPartyName's local fuzzy match on the
 * (sanitized) `party` field. existing_party is NEVER trusted on its own
 * merits — only exact list membership counts — so a hallucinated or junk
 * value degrades gracefully to the same fallback used before this field
 * existed.
 *
 * `party` and `note` are run through sanitizeModelText first (see its doc)
 * so a stray tag-like serialization artifact never reaches the user or
 * pollutes matching/validation — notably, a party that sanitizes down to
 * "" correctly trips validateExtraction's "missing party" check below.
 */
export function buildExtractResult(
  raw: RawExtraction,
  transcript: string,
  existingPartyNames: readonly string[]
): ExtractResult {
  const sanitized: RawExtraction = {
    ...raw,
    party: sanitizeModelText(raw.party),
    note: sanitizeModelText(raw.note),
  };

  const problems = validateExtraction(sanitized);

  const acceptedExisting = acceptExistingParty(raw.existing_party, existingPartyNames);
  const { name, matched } = acceptedExisting
    ? { name: acceptedExisting, matched: true }
    : matchPartyName(sanitized.party ?? "", existingPartyNames);

  const { amount_paise, disagreement, confidencePenalty } = crossCheckAmount(
    transcript,
    sanitized.amount_paise ?? 0
  );

  const adjustedConfidence = Math.max(0, Math.min(1, (sanitized.confidence ?? 0) - confidencePenalty));
  const needsReview = problems.length > 0 || adjustedConfidence < CONFIDENCE_REVIEW_THRESHOLD;

  return {
    party: name,
    partyMatched: matched,
    amount_paise,
    direction: sanitized.direction === "paid" || sanitized.direction === "received" ? sanitized.direction : "paid",
    note: sanitized.note ?? "",
    confidence: adjustedConfidence,
    needsReview,
    amountDisagreement: disagreement,
  };
}
