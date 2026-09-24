/**
 * Sarvam's speech-to-text endpoint accepts a fixed list of BARE audio MIME
 * types ("audio/webm", "audio/ogg", "audio/mp4", ...) and rejects
 * parameterized ones with a 400 — including "audio/webm;codecs=opus", which
 * is exactly what MediaRecorder reports on Chrome/Android. So every upload
 * is relabelled with its bare type and a matching file extension.
 */

const EXTENSION_BY_TYPE: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
};

export interface AudioUploadLabel {
  contentType: string;
  filename: string;
}

/** Maps a recorder MIME type to the bare content type and filename to send
 * to Sarvam. Unknown or empty types fall back to webm, the format every
 * Chromium browser records in. */
export function normalizeAudioUpload(mimeType: string): AudioUploadLabel {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  const extension = EXTENSION_BY_TYPE[base];
  if (extension) return { contentType: base, filename: `audio.${extension}` };
  return { contentType: "audio/webm", filename: "audio.webm" };
}
