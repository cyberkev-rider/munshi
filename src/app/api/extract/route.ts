/**
 * POST /api/extract — server-side call to Claude that turns a raw STT
 * transcript into a structured transaction: { party, amount_paise,
 * direction, note, confidence }. Uses the @anthropic-ai/sdk with a strict
 * tool schema so the model's output is guaranteed-parseable JSON (no
 * free-text parsing on our end).
 *
 * ANTHROPIC_API_KEY lives only in this server-side module and is never sent
 * to the client. Model defaults to claude-sonnet-5, overridable via
 * ANTHROPIC_MODEL for easy swaps without a code change.
 *
 * The route also cross-checks the LLM's amount against a deterministic
 * parse of the transcript (src/lib/hindi-numbers.ts via extract-helpers.ts)
 * and fuzzy-matches the extracted party name against the caller-supplied
 * list of existing parties, so "Ramesh bhai" resolves to an existing
 * "Ramesh" party rather than creating a duplicate.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { isMockMode, aiError, statusForError } from "@/lib/ai-config";
import { MOCK_EXTRACTION } from "@/lib/ai-mock-data";
import { buildExtractResult, type RawExtraction } from "@/lib/extract-helpers";

export const runtime = "nodejs";

const DEFAULT_MODEL = "claude-sonnet-5";

/** Strict tool schema forcing the model's reply into exactly the shape
 * extract-helpers.ts expects. `strict: true` guarantees the API validates
 * tool_use.input against this schema before returning it to us. */
const EXTRACT_TOOL: Anthropic.Tool = {
  name: "record_transaction",
  description:
    "Records the single money transaction described in the shopkeeper's voice transcript.",
  input_schema: {
    type: "object",
    properties: {
      party: {
        type: "string",
        description:
          "The name of the person/business money was exchanged with, as spoken (e.g. 'Ramesh', 'Suresh bhai'). If genuinely no name is mentioned, use an empty string.",
      },
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
    required: ["party", "amount_paise", "direction", "note", "confidence"],
    additionalProperties: false,
  },
  strict: true,
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

You will also be given a list of the shopkeeper's existing party (contact) names. If the transcript's spoken name is clearly the same person as an existing party under a slightly different form (e.g. "Ramesh bhai" for existing party "Ramesh"), extract the name AS SPOKEN in the transcript — the caller will fuzzy-match it against the existing list itself. Do not silently rewrite the spoken name to the existing party's exact spelling.

Always call the record_transaction tool exactly once with your best extraction. If the transcript is too garbled to extract a party name or amount at all, still call the tool: use an empty string for party and/or a best-guess amount_paise, and set confidence low (below 0.5) so the app knows to ask the user to fix it.`;

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

  const partyListLine =
    existingPartyNames.length > 0
      ? `Existing party names: ${existingPartyNames.join(", ")}`
      : "Existing party names: (none yet)";

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "record_transaction" },
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

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) {
    const err = aiError("upstream_error", "Claude did not return a tool_use block");
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  const raw = toolUse.input as RawExtraction;
  const result = buildExtractResult(raw, transcript, existingPartyNames);

  return NextResponse.json(result);
}
