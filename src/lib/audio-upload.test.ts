import { describe, expect, it } from "vitest";
import { normalizeAudioUpload } from "./audio-upload";

describe("normalizeAudioUpload", () => {
  it("strips the codecs parameter Chrome/Android MediaRecorder adds", () => {
    expect(normalizeAudioUpload("audio/webm;codecs=opus")).toEqual({
      contentType: "audio/webm",
      filename: "audio.webm",
    });
  });

  it("strips parameters from Firefox's ogg recordings", () => {
    expect(normalizeAudioUpload("audio/ogg; codecs=opus")).toEqual({
      contentType: "audio/ogg",
      filename: "audio.ogg",
    });
  });

  it("maps Safari's mp4 recordings to an m4a filename", () => {
    expect(normalizeAudioUpload("audio/mp4")).toEqual({
      contentType: "audio/mp4",
      filename: "audio.m4a",
    });
  });

  it("keeps wav uploads as wav", () => {
    expect(normalizeAudioUpload("audio/wav")).toEqual({
      contentType: "audio/wav",
      filename: "audio.wav",
    });
  });

  it("is case-insensitive", () => {
    expect(normalizeAudioUpload("AUDIO/WEBM;CODECS=OPUS").contentType).toBe("audio/webm");
  });

  it("falls back to webm for empty or unknown types", () => {
    expect(normalizeAudioUpload("")).toEqual({ contentType: "audio/webm", filename: "audio.webm" });
    expect(normalizeAudioUpload("application/x-unknown")).toEqual({
      contentType: "audio/webm",
      filename: "audio.webm",
    });
  });
});
