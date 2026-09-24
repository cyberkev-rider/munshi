/**
 * POST /api/tts — server-side proxy to Sarvam AI's text-to-speech endpoint
 * (bulbul:v3). Accepts { text, lang } and returns the synthesized speech as
 * RAW BINARY audio (audio/wav) — never JSON-wrapped base64 — so the client
 * can hand the response body straight to an <audio> element via a blob URL.
 *
 * SARVAM_API_KEY lives only in this server-side module (process.env) and is
 * never sent to the client, exactly like /api/transcribe.
 *
 * Sarvam API reference (docs.sarvam.ai, confirmed via WebFetch 2026-09-24):
 *   POST https://api.sarvam.ai/text-to-speech
 *   Header: api-subscription-key: <key>
 *   Body (application/json): { text, language_code, model, speaker, pace }
 *   Response: { request_id, audios: [base64WavString, ...] }
 *
 * NOTE ON A SPEC DEVIATION: this route's product spec named the language
 * field `target_language_code`. The confirmed docs — both
 * docs.sarvam.ai/api-reference-docs/text-to-speech/api/rest-api (verbatim
 * curl example) and docs.sarvam.ai/api-reference/text-to-speech/convert —
 * call it `language_code`. `target_language_code` belongs to Sarvam's
 * separate speech-to-text-translate endpoint, not text-to-speech. This
 * route uses the confirmed name.
 *
 * v3 speaker/param notes (also confirmed via the docs above): v3 has 30+
 * speakers (shubh is the documented default); `pitch`/`loudness`/
 * `enable_preprocessing` are v2-only and are NOT accepted by v3. `pace`
 * (0.5-2.0, default 1.0) IS supported by v3, which is how the "slightly
 * slower for elderly/semi-literate listeners" requirement is implemented.
 */

import { NextRequest, NextResponse } from "next/server";
import { isMockMode, aiError, statusForError } from "@/lib/ai-config";

export const runtime = "nodejs";

const SARVAM_ENDPOINT = "https://api.sarvam.ai/text-to-speech";
const MAX_TEXT_LENGTH = 500;
const UPSTREAM_TIMEOUT_MS = 15_000;

/** bulbul:v3's documented default speaker. The docs list 30+ v3 speakers
 * but don't publish per-speaker language suitability beyond the master
 * list — every v3 speaker is designed to render all 11 supported
 * languages from one `speaker` + `language_code` pair, so the documented
 * default is a safe, clear choice for both hi-IN and en-IN. */
const SPEAKER = "shubh";

/** Slightly under the 1.0 default (v3's supported range is 0.5-2.0) since
 * listeners may be elderly or semi-literate and need unhurried playback. */
const PACE = 0.85;

const LANG_TO_CODE = {
  hi: "hi-IN",
  en: "en-IN",
} as const;

type SupportedLang = keyof typeof LANG_TO_CODE;

function isSupportedLang(value: unknown): value is SupportedLang {
  return value === "hi" || value === "en";
}

interface TtsRequestBody {
  text?: unknown;
  lang?: unknown;
}

interface SarvamTtsResponse {
  request_id?: string;
  audios?: string[];
}

export async function POST(request: NextRequest) {
  let body: TtsRequestBody;
  try {
    body = await request.json();
  } catch {
    const err = aiError("invalid_request", "Request body is not valid JSON");
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const lang = body.lang;

  if (text === "" || text.length > MAX_TEXT_LENGTH || !isSupportedLang(lang)) {
    const err = aiError(
      "invalid_request",
      "'text' must be a non-empty string of at most 500 characters, and 'lang' must be 'hi' or 'en'"
    );
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  const apiKey = process.env.SARVAM_API_KEY;
  const mock = isMockMode(Boolean(apiKey));

  // Never fabricate audio in mock mode or when the key is missing — the
  // client falls back to browser speech synthesis on this exact response
  // (see speech.ts), the same contract /api/transcribe already uses.
  if (mock || !apiKey) {
    const err = aiError("missing_api_key", "SARVAM_API_KEY is not set");
    return NextResponse.json(err, { status: statusForError(err.error) });
  }

  let upstream: Response;
  try {
    upstream = await fetch(SARVAM_ENDPOINT, {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        language_code: LANG_TO_CODE[lang],
        model: "bulbul:v3",
        speaker: SPEAKER,
        pace: PACE,
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      const errBody = aiError("timeout", "Sarvam TTS request timed out");
      return NextResponse.json(errBody, { status: statusForError(errBody.error) });
    }
    const message = err instanceof Error ? err.message : String(err);
    const errBody = aiError("upstream_error", `Failed to reach Sarvam: ${message}`);
    return NextResponse.json(errBody, { status: statusForError(errBody.error) });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    const errBody = aiError("upstream_error", `Sarvam returned ${upstream.status}: ${detail}`);
    return NextResponse.json(errBody, { status: statusForError(errBody.error) });
  }

  let data: SarvamTtsResponse;
  try {
    data = await upstream.json();
  } catch {
    const errBody = aiError("upstream_error", "Sarvam returned a non-JSON response");
    return NextResponse.json(errBody, { status: statusForError(errBody.error) });
  }

  const audioBase64 = data.audios?.[0];
  if (!audioBase64) {
    const errBody = aiError("upstream_error", "Sarvam response missing audio");
    return NextResponse.json(errBody, { status: statusForError(errBody.error) });
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");

  return new NextResponse(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
    },
  });
}
