/**
 * Shared "is the spoken party one of the shopkeeper's existing parties?"
 * contract used by BOTH AI routes:
 *  - /api/extract, which extracts a whole transaction and includes this as
 *    one field (existing_party) among several,
 *  - /api/match-party, which answers ONLY this question, for the voice
 *    confirm screen's "किसका हिसाब है? नाम बोलिए।" clarifying-answer flow.
 *
 * Kept in one place so the matching RULES (cross-script, spelling
 * variants, honorifics) — the prompt prose, the JSON-schema fragment that
 * asks Claude to apply them, and the strict acceptance check on the
 * result — can never drift out of sync between the two routes.
 *
 * This is deliberately separate from extract-helpers.ts's matchPartyName:
 * that is a pure LOCAL fuzzy matcher (exact/substring, same-script only)
 * used as a deterministic fallback everywhere; this module is about what
 * we ask the LLM to do (and how strictly we trust what comes back) when
 * the local matcher can't resolve a cross-script or oddly-spelled name.
 */

/** System-prompt prose both routes include verbatim. The few-shots reuse
 * the same running example (Ramesh/Suresh/Mohan) as /api/extract's other
 * few-shots, so a reviewer only has to learn one cast of characters. */
export const PARTY_MATCH_INSTRUCTIONS = `You will be given a list of the shopkeeper's existing party (contact) names, exactly as they are stored (usually typed in Latin script). Decide whether the spoken party is the SAME person or business as one of these existing names, even when it is:
- written in a different script (Devanagari "सुरेश" is the same person as Latin "Suresh")
- spelled slightly differently ("Ramesh" vs "Rameshh")
- spoken with an honorific or filler word attached ("Ramesh bhai", "रमेश जी", "Mohan seth", "मोहन सेठ")

If it is the same person/business as one of the existing names, set existing_party to that existing name EXACTLY as it appears in the provided list — same script, same spelling, same casing, character for character. Never invent a spelling that is not in the list, and never guess when unsure. If it is not clearly the same as any existing name (including when the list is empty, or no party was mentioned at all), set existing_party to "" (an empty string).

Few-shot examples (existing party names: Ramesh, Suresh, Mohan):
- Spoken party "सुरेश" -> existing_party: "Suresh"
- Spoken party "रमेश भाई" -> existing_party: "Ramesh"
- Spoken party "मोहन सेठ" -> existing_party: "Mohan"
- Spoken party "Rameshh" -> existing_party: "Ramesh"
- Spoken party "गोपाल" (not in the list) -> existing_party: ""`;

/** JSON-schema property definition for `existing_party`, shared verbatim
 * by /api/extract's full extraction schema and /api/match-party's own
 * schema. */
export const EXISTING_PARTY_SCHEMA_PROPERTY: { type: "string"; description: string } = {
  type: "string",
  description:
    "The matching existing party name, copied EXACTLY as listed in the provided existing party names, if the spoken party is the same person/business (even under a different script, spelling, or honorific). Empty string if it does not match any existing party.",
};

/** Full structured-output schema for /api/match-party, whose only job is
 * answering this one question. */
export const MATCH_PARTY_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    existing_party: EXISTING_PARTY_SCHEMA_PROPERTY,
  },
  required: ["existing_party"],
  additionalProperties: false,
};

/** Shape of /api/match-party's structured-output JSON (and of
 * /api/extract's existing_party field, in isolation). */
export interface RawPartyMatch {
  existing_party: string;
}

/** Formats the "Existing party names: ..." line both routes send the
 * model, right before the transcript/spoken name. */
export function formatExistingPartyListLine(existingPartyNames: readonly string[]): string {
  return existingPartyNames.length > 0
    ? `Existing party names: ${existingPartyNames.join(", ")}`
    : "Existing party names: (none yet)";
}

/**
 * Accepts a model-proposed `existing_party` value ONLY when it exactly
 * matches (case-insensitively, trimmed) a member of existingPartyNames.
 * The model is never trusted to invent or subtly alter a stored name, so
 * this is a strict membership check, not a fuzzy one — a junk value (a
 * stray serialization artifact, an invented spelling, or any non-member
 * string) simply fails to match and the caller falls back to its own
 * deterministic matching. Returns the member's canonical (as-stored)
 * spelling, or null.
 */
export function acceptExistingParty(
  existingPartyText: string | null | undefined,
  existingPartyNames: readonly string[]
): string | null {
  const candidate = (existingPartyText ?? "").trim();
  if (!candidate) return null;
  const lower = candidate.toLowerCase();
  for (const name of existingPartyNames) {
    if (name.trim().toLowerCase() === lower) return name;
  }
  return null;
}
