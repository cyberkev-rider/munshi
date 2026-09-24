/**
 * POST /api/extract — server-side call to Claude that turns a raw STT
 * transcript into a structured transaction: { party, amount_paise,
 * direction, note, confidence }. Uses the @anthropic-ai/sdk's structured
 * outputs (`output_config: { format: { type: "json_schema", schema } }`)
 * so the model's reply is a JSON object matching our schema — read off the
 * response's `text` content block and JSON.parse'd, no tool-use
 * indirection and no free-text parsing on our end.
 *
 * ANTHROPIC_API_KEY lives only in this server-side module and is never sent
 * to the client. Model defaults to claude-sonnet-5, overridable via
 * ANTHROPIC_MODEL for easy swaps without a code change.
 *
 * The route also cross-checks the LLM's amount against a deterministic
 * parse of the transcript (src/lib/hindi-numbers.ts via extract-helpers.ts)
 * and asks the model itself to cross-script/spelling/honorific-match the
 * extracted party name against the caller-supplied list of existing
 * parties (the `existing_party` field, whose prompt/schema is shared with
 * /api/match-party — see src/lib/party-match.ts), falling back to
 * extract-helpers.ts's own local fuzzy matchPartyName when the model
 * doesn't recognize a match. This is what lets e.g. Devanagari "सुरेश"
 * resolve to an existing Latin-spelled "Suresh" party rather than creating
 * a duplicate.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { isMockMode, aiError, statusForError } from "@/lib/ai-config";
import { MOCK_EXTRACTION } from "@/lib/ai-mock-data";
import { buildExtractResult, type RawExtraction } from "@/lib/extract-helpers";
import { EXISTING_PARTY_SCHEMA_PROPERTY, formatExistingPartyListLine, PARTY_MATCH_INSTRUCTIONS } from "@/lib/party-match";

export const runtime = "nodejs";

const DEFAULT_MODEL = "claude-sonnet-5";

/** Structured-output schema forcing the model's reply into exactly the
 * shape extract-helpers.ts expects. additionalProperties: false plus every
 * field listed as required guarantees the parsed JSON always has all six
 * fields, even when the model has nothing useful to say for one of them
 * (empty string / low confidence rather than an omitted field). */
const EXTRACT_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    party: {
      type: "string",
      description:
        "The name of the person/business money was exchanged with, exactly AS SPOKEN in the transcript (e.g. 'Ramesh', 'Suresh bhai', 'सुरेश') — never rewritten to an existing party's spelling (see existing_party for that). If genuinely no name is mentioned, use an empty string.",
    },
    existing_party: EXISTING_PARTY_SCHEMA_PROPERTY,
    amount_paise: {
      type: "integer",
      description: "The transaction amount in integer paise (rupees * 100). E.g. 500 rupees -> 50000.",
    },
    direction: {
      type: "string",
      enum: ["paid", "received"],
      description:
        "'paid' if the shop owner GAVE money (diye/de diye/bheje); 'received' if the shop owner GOT money (aaye/mile/liye).",
    },
    note: {
      type: "string",
      description:
        "Short narration of anything beyond party+amount+direction: goods bought/sold, udhaar (credit) remarks, reasons, etc. Empty string if there is nothing extra to note.",
    },
    confidence: {
      type: "number",
      description:
        "Your confidence (0.0 to 1.0) that party, amount_paise, and direction were all extracted correctly from a possibly noisy transcript.",
    },
  },
  required: ["party", "existing_party", "amount_paise", "direction", "note", "confidence"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are an expert at extracting structured bookkeeping entries from Hindi/Hinglish voice transcripts dictated by small Indian shopkeepers. The transcripts come from speech-to-text and may mix Devanagari and Latin script, mix Hindi and English words, and contain spoken Indian number words.

Indian spoken-number vocabulary you must understand (rupees unless stated otherwise):
- sau = 100, hazaar/hazar = 1,000, lakh = 100,000, crore = 10,000,000
- dedh = 1.5x the next unit (dedh sau = 150, dedh lakh = 150,000 rupees)
- dhai = 2.5x the next unit (dhai hazaar = 2,500, dhai sau = 250)
- sava = 1.25x the next unit (sava sau = 125, sava hazaar = 1,250)
- paune = 0.75x the next unit, i.e. a quarter short (paune do sau = 175, paune sau = 75)
- Digit-word and digit-numeral mixes are common: "2 hazaar 5 sau" = 2500, "3 thousand" = 3000

Direction cues:
- "diye", "de diye", "bheje", "de diya" -> the shop owner PAID (gave money) -> direction: "paid"
- "aaye", "mile", "liye", "aa gaye" -> the shop owner RECEIVED money -> direction: "received"

The note field captures anything beyond party + amount + direction: what was bought/sold, a partial-payment/udhaar (credit) remark, or any other detail mentioned. If nothing extra was said, note is an empty string.

Few-shot examples:
1. "Ramesh ko paanch sau rupaye diye" -> party: "Ramesh", amount_paise: 50000, direction: "paid", note: ""
2. "Suresh se 3 hazaar aaye" -> party: "Suresh", amount_paise: 300000, direction: "received", note: ""
3. "Mohan ko 2 thousand 5 hundred diye, baaki 500 udhaar" -> party: "Mohan", amount_paise: 250000, direction: "paid", note: "baaki 500 udhaar"
4. "dhai hazaar diye Ramesh ko" -> party: "Ramesh", amount_paise: 250000, direction: "paid", note: ""
5. "sava sau ka saman becha Suresh ko" -> party: "Suresh", amount_paise: 12500, direction: "received", note: "saman becha"
6. "paune do sau Mohan se aaye" -> party: "Mohan", amount_paise: 17500, direction: "received", note: ""
7. "dedh lakh rupaye ka order Ramesh ko diya" -> party: "Ramesh", amount_paise: 15000000, direction: "paid", note: "order"

${PARTY_MATCH_INSTRUCTIONS}

The party field above is always the name AS SPOKEN (script, spelling, honorific and all) — never rewritten to match an existing spelling. existing_party is judged separately, per the rules just given.

Always respond with your best extraction, following the JSON schema exactly. If the transcript is too garbled to extract a party name or amount at all, still respond: use an empty string for party (and "" for existing_party) and/or a best-guess amount_paise, and set confidence low (below 0.5) so the app knows to ask the user to fix it.`;

interface ExtractRequestBody {
  transcript?: string;
  existingPartyNames?: string[];
}

export async function POST(request: NextRequest) {
  let body: ExtractRequestBody;
  try {
    body = await request.json();
  } catch {
    const err = aiError("invalid_request", "Request body is not valid JSON");
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  const transcript = body.transcript?.trim();
  const existingPartyNames = Array.isArray(body.existingPartyNames) ? body.existingPartyNames : [];

  if (!transcript) {
    const err = aiError("invalid_request", "Missing 'transcript' field");
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const mock = isMockMode(Boolean(apiKey));

  if (mock) {
    const result = buildExtractResult(MOCK_EXTRACTION, transcript, existingPartyNames);
    return NextResponse.json({ ...result, mock: true });
  }

  if (!apiKey) {
    const err = aiError("missing_api_key", "ANTHROPIC_API_KEY is not set");
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const partyListLine = formatExistingPartyListLine(existingPartyNames);

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      // claude-sonnet-5 runs adaptive thinking by default, which counts
      // against max_tokens — 1024 risked truncating the JSON output before
      // it ever reached the final answer.
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: EXTRACT_OUTPUT_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: `${partyListLine}\n\nTranscript: "${transcript}"`,
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof Anthropic.AuthenticationError ? "missing_api_key" : "upstream_error";
    const body2 = aiError(code, `Anthropic API error: ${message}`);
    return NextResponse.json(body2, { status: statusForError(body2.error) });
  }

  if (response.stop_reason === "refusal") {
    const err = aiError("upstream_error", "Claude declined to process this transcript");
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  if (response.stop_reason === "max_tokens") {
    const err = aiError("upstream_error", "Claude's structured output was truncated (max_tokens)");
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");

  if (!textBlock) {
    const err = aiError("upstream_error", "Claude did not return a text block");
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  let raw: RawExtraction;
  try {
    raw = JSON.parse(textBlock.text) as RawExtraction;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const body2 = aiError("upstream_error", `Claude returned malformed structured output: ${message}`);
    return NextResponse.json(body2, { status: statusForError(body2.error) });
  }

  const result = buildExtractResult(raw, transcript, existingPartyNames);

  return NextResponse.json(result);
}
