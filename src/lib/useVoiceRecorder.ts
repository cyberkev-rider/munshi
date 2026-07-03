"use client";

/**
 * Wraps navigator.mediaDevices.getUserMedia + MediaRecorder into a small
 * discriminated-union state machine for the /voice capture flow.
 *
 * Terminal transitions (stopped/permission-denied/error) are reported via the
 * callbacks passed in, invoked directly from the MediaRecorder event handlers
 * / getUserMedia catch block — NOT via a useEffect watching `state` — so
 * callers can kick off the next async step (upload, etc.) from a real event
 * handler rather than synchronously setting state inside an effect.
 *
 * Not unit tested: MediaRecorder/getUserMedia don't meaningfully exist in
 * jsdom, and mocking them exhaustively would test the mock, not this hook.
 * The app's existing tests (hindi-numbers, extract-helpers) focus on pure
 * logic instead — this hook is verified manually via the browser preview.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState =
  | { status: "idle" }
  | { status: "recording" }
  | { status: "stopped"; blob: Blob }
  | { status: "permission-denied" }
  | { status: "error"; message: string };

export interface UseVoiceRecorderCallbacks {
  onStopped: (blob: Blob) => void;
  onPermissionDenied: () => void;
  onError: (message: string) => void;
}

const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export interface UseVoiceRecorder {
  state: RecorderState;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
  reset: () => void;
}

export function useVoiceRecorder(callbacks: UseVoiceRecorderCallbacks): UseVoiceRecorder {
  const [state, setState] = useState<RecorderState>({ status: "idle" });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Kept fresh every render so the MediaRecorder event handlers (created once
  // per start() call) always invoke the caller's latest closure. Updated in
  // an effect (not during render) per react-hooks/refs.
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopTracks, [stopTracks]);

  const start = useCallback(async () => {
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType ?? recorder.mimeType });
        stopTracks();
        setState({ status: "stopped", blob });
        callbacksRef.current.onStopped(blob);
      };

      recorder.start();
      setState({ status: "recording" });
    } catch (err) {
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setState({ status: "permission-denied" });
        callbacksRef.current.onPermissionDenied();
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: "error", message });
      callbacksRef.current.onError(message);
    }
  }, [stopTracks]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    stopTracks();
    setState({ status: "idle" });
  }, [stopTracks]);

  const reset = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return { state, start, stop, cancel, reset };
}
