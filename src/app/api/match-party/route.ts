/**
 * POST /api/match-party — answers the voice confirm screen's spoken
 * clarifying question "किसका हिसाब है? नाम बोलिए।": given a name the
 * shopkeeper just said and the app's existing party list, decides whether
 * it's an existing party (returning its canonical spelling) or a brand-new
 * one.
 *
 * { name: string, existingPartyNames: string[] } -> { party: string,
 * partyMatched: boolean }
 *
 * Deterministic-first: extract-helpers.ts's matchPartyName (exact/substring
 * match) runs before any LLM call, since it already resolves the common
 * same-script cases (typos aside) for free, at zero latency/cost. The LLM
 * is only asked for the harder cases matchPartyName can't resolve on its
 * own — cross-script names ("सुरेश" vs "Suresh") or differently-spelled/
 * honorific-carrying ones — using the SAME matching rules and schema
 * fragment as /api/extract's existing_party field (src/lib/party-match.ts),
 * so the two routes can never disagree about what counts as a match.
 *
 * Matching is deliberately best-effort and must never block the
 * shopkeeper: missing/invalid input still gets a 400 (the caller has a
 * bug), but any UPSTREAM failure (missing key, mock mode, network error,
 * a malformed or refused model response) quietly falls back to the
 * deterministic result rather than a 5xx.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { isMockMode, aiError, statusForError } from "@/lib/ai-config";
import { matchPartyName } from "@/lib/extract-helpers";
import {
  acceptExistingParty,
  formatExistingPartyListLine,
  MATCH_PARTY_OUTPUT_SCHEMA,
  PARTY_MATCH_INSTRUCTIONS,
  type RawPartyMatch,
} from "@/lib/party-match";

export const runtime = "nodejs";

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_NAME_LENGTH = 100;
const MAX_EXISTING_NAMES = 500;

const SYSTEM_PROMPT = `You are matching a spoken party (contact) name against a shopkeeper's existing party list for a voice bookkeeping app.

${PARTY_MATCH_INSTRUCTIONS}`;

interface MatchPartyRequestBody {
  name?: string;
  existingPartyNames?: string[];
}

interface MatchPartyResult {
  party: string;
  partyMatched: boolean;
}

function deterministicResult(name: string, existingPartyNames: readonly string[]): MatchPartyResult {
  const { name: party, matched } = matchPartyName(name, existingPartyNames);
  return { party, partyMatched: matched };
}

export async function POST(request: NextRequest) {
  let body: MatchPartyRequestBody;
  try {
    body = await request.json();
  } catch {
    const err = aiError("invalid_request", "Request body is not valid JSON");
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) {
    const err = aiError(
      "invalid_request",
      `'name' must be a non-empty string of at most ${MAX_NAME_LENGTH} characters`
    );
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  const existingPartyNamesRaw = body.existingPartyNames;
  if (existingPartyNamesRaw !== undefined) {
    const isValidArray =
      Array.isArray(existingPartyNamesRaw) &&
      existingPartyNamesRaw.length <= MAX_EXISTING_NAMES &&
      existingPartyNamesRaw.every((n) => typeof n === "string");
    if (!isValidArray) {
      const err = aiError(
        "invalid_request",
        `'existingPartyNames' must be an array of at most ${MAX_EXISTING_NAMES} strings`
      );
      return NextResponse.json(err, { status: statusForError(err.error) });
    }
  }

  const existingPartyNames = Array.isArray(existingPartyNamesRaw) ? existingPartyNamesRaw : [];

  const deterministic = deterministicResult(name, existingPartyNames);

  // Deterministic already resolved it, or there's nothing to match against
  // — either way, no need to spend an LLM call.
  if (deterministic.partyMatched || existingPartyNames.length === 0) {
    return NextResponse.json(deterministic);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const mock = isMockMode(Boolean(apiKey));

  if (mock || !apiKey) {
    return NextResponse.json(deterministic);
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  try {
    const response = await client.messages.create({
      model,
      // Same headroom as /api/extract, and for the same reason: claude-
      // sonnet-5 runs adaptive thinking by default, which counts against
      // max_tokens before the (tiny) JSON answer itself is even produced.
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: MATCH_PARTY_OUTPUT_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: `${formatExistingPartyListLine(existingPartyNames)}\n\nSpoken party: "${name}"`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return NextResponse.json(deterministic);
    }

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
    if (!textBlock) {
      return NextResponse.json(deterministic);
    }

    const parsed = JSON.parse(textBlock.text) as RawPartyMatch;
    const accepted = acceptExistingParty(parsed.existing_party, existingPartyNames);
    if (accepted) {
      const result: MatchPartyResult = { party: accepted, partyMatched: true };
      return NextResponse.json(result);
    }
    return NextResponse.json(deterministic);
  } catch {
    // Upstream failure of any kind (network, auth, malformed JSON, ...):
    // matching is best-effort and must never block the shopkeeper, so fall
    // back to the deterministic result rather than surfacing a 5xx.
    return NextResponse.json(deterministic);
  }
}
