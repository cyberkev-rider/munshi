/**
 * POST /api/transcribe — server-side proxy to Sarvam AI's speech-to-text
 * endpoint (saaras:v3, codemix mode). Accepts a multipart/form-data upload
 * with an `audio` field (the recorded clip from the client's
 * MediaRecorder), forwards it to Sarvam, and returns { transcript, language }.
 *
 * SARVAM_API_KEY lives only in this server-side module (process.env) and is
 * never sent to the client. See .env.local.example for setup.
 *
 * Sarvam API reference (docs.sarvam.ai, confirmed via WebFetch):
 *   POST https://api.sarvam.ai/speech-to-text
 *   Header: api-subscription-key: <key>
 *   Body (multipart/form-data): file, model="saaras:v3", mode="codemix"
 *   Response: { request_id, transcript, language_code, ... }
 *
 * We use mode="codemix" (not "translate") because the product spec calls
 * for the STT-TRANSLATE model's codemix capability — i.e. we want the
 * transcript to preserve the shopkeeper's actual Hinglish speech (mixed
 * Devanagari/Latin, mixed Hindi/English words) rather than translating it
 * to pure English, since the downstream Claude extraction step (and the
 * deterministic Hindi number parser) both expect to see the original
 * number words like "paanch sau" rather than "five hundred".
 */

import { NextRequest, NextResponse } from "next/server";
import { isMockMode, aiError, statusForError } from "@/lib/ai-config";
import { MOCK_TRANSCRIPT, MOCK_LANGUAGE } from "@/lib/ai-mock-data";
import { normalizeAudioUpload } from "@/lib/audio-upload";

export const runtime = "nodejs";

const SARVAM_ENDPOINT = "https://api.sarvam.ai/speech-to-text";

interface SarvamResponse {
  request_id?: string;
  transcript?: string;
  language_code?: string | null;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.SARVAM_API_KEY;
  const mock = isMockMode(Boolean(apiKey));

  if (mock) {
    return NextResponse.json({
      transcript: MOCK_TRANSCRIPT,
      language: MOCK_LANGUAGE,
      mock: true,
    });
  }

  if (!apiKey) {
    const body = aiError("missing_api_key", "SARVAM_API_KEY is not set");
    return NextResponse.json(body, { status: statusForError(body.error) });
  }

  let incomingForm: FormData;
  try {
    incomingForm = await request.formData();
  } catch {
    const body = aiError("invalid_request", "Request is not valid multipart/form-data");
    return NextResponse.json(body, { status: statusForError(body.error) });
  }

  const audio = incomingForm.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    const body = aiError("invalid_audio", "Missing or empty 'audio' field");
    return NextResponse.json(body, { status: statusForError(body.error) });
  }

  const sarvamForm = new FormData();
  const { contentType, filename } = normalizeAudioUpload(audio.type);
  sarvamForm.append("file", audio.slice(0, audio.size, contentType), filename);
  sarvamForm.append("model", "saaras:v3");
  sarvamForm.append("mode", "codemix");

  let upstream: Response;
  try {
    upstream = await fetch(SARVAM_ENDPOINT, {
      method: "POST",
      headers: { "api-subscription-key": apiKey },
      body: sarvamForm,
    });
  } catch (err) {
    const body = aiError(
      "upstream_error",
      `Failed to reach Sarvam: ${err instanceof Error ? err.message : String(err)}`
    );
    return NextResponse.json(body, { status: statusForError(body.error) });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    const body = aiError("upstream_error", `Sarvam returned ${upstream.status}: ${detail}`);
    return NextResponse.json(body, { status: statusForError(body.error) });
  }

  let data: SarvamResponse;
  try {
    data = await upstream.json();
  } catch {
    const body = aiError("upstream_error", "Sarvam returned a non-JSON response");
    return NextResponse.json(body, { status: statusForError(body.error) });
  }

  if (!data.transcript) {
    const body = aiError("upstream_error", "Sarvam response missing transcript");
    return NextResponse.json(body, { status: statusForError(body.error) });
  }

  return NextResponse.json({
    transcript: data.transcript,
    language: data.language_code ?? "unknown",
  });
}
