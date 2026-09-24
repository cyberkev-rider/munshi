"use client";

/**
 * Client speech player for Step 3's text-to-speech read-back: a
 * MODULE-LEVEL singleton (not component state) plus a useSpeech() hook that
 * subscribes React components to it.
 *
 * Why module-level: the spoken "एंट्री सेव हो गई"/"Entry saved" confirmation
 * must keep playing across the router.push("/") that follows a save. By the
 * time that navigation finishes, the component that called speak() has
 * already unmounted — a plain useState-backed player would be torn down
 * with it. A single HTMLAudioElement created once here, outside any
 * component's lifecycle, is what lets playback survive the navigation.
 *
 * Flow: speak(text, lang) POSTs /api/tts, turns the binary response into a
 * blob object URL, and plays it on one shared <audio> element. If the
 * network call fails, the response isn't OK (including /api/tts's 503 for
 * mock-mode/missing-key), or the browser is offline, this falls back to
 * window.speechSynthesis so the confirm screen is never silently stuck.
 */

import { useSyncExternalStore } from "react";
import type { Language } from "./i18n";

export interface SpeechSnapshot {
  /** True whenever audio (server TTS or the browser fallback) is playing. */
  speaking: boolean;
  /** True when the browser blocked autoplay (play() rejected with
   * NotAllowedError) — the UI should invite an explicit tap to retry. */
  blocked: boolean;
}

type Listener = () => void;

const CACHE_LIMIT = 30;

/** In-memory blob-URL cache keyed "<lang>|<text>", capped at CACHE_LIMIT
 * entries with simple oldest-first eviction (Map preserves insertion
 * order for keys that were never re-set). Evicted URLs are revoked so they
 * don't leak. */
const cache = new Map<string, string>();

let audioEl: HTMLAudioElement | null = null;
let currentRequestId = 0;
let snapshot: SpeechSnapshot = { speaking: false, blocked: false };
const listeners = new Set<Listener>();

function setSnapshot(next: SpeechSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.addEventListener("ended", () => setSnapshot({ speaking: false, blocked: false }));
  }
  return audioEl;
}

function cacheKey(text: string, lang: Language): string {
  return `${lang}|${text}`;
}

function cacheGet(text: string, lang: Language): string | undefined {
  return cache.get(cacheKey(text, lang));
}

function cacheSet(text: string, lang: Language, url: string): void {
  cache.set(cacheKey(text, lang), url);
  while (cache.size > CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldestUrl = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
  }
}

function pickVoice(lang: Language, targetTag: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === targetTag) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(lang))
  );
}

/** Browser-native fallback via window.speechSynthesis. Resolves quietly
 * (just clears the speaking state) when speech synthesis isn't available
 * at all — the UI must keep working silently rather than error out. */
function speakWithBrowserFallback(text: string, lang: Language): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    setSnapshot({ speaking: false, blocked: false });
    return;
  }

  const targetTag = lang === "hi" ? "hi-IN" : "en-IN";
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = targetTag;
  const voice = pickVoice(lang, targetTag);
  if (voice) utterance.voice = voice;
  utterance.onend = () => setSnapshot({ speaking: false, blocked: false });
  utterance.onerror = () => setSnapshot({ speaking: false, blocked: false });

  setSnapshot({ speaking: true, blocked: false });
  window.speechSynthesis.speak(utterance);
}

/** Pauses/resets the shared <audio> element and cancels any queued browser
 * speech-synthesis utterance. Does not touch `snapshot` itself — callers
 * decide what state follows (a new speak(), or an explicit stop()). */
function haltCurrentPlayback(): void {
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute("src");
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function playUrl(url: string, requestId: number, text: string, lang: Language): void {
  if (requestId !== currentRequestId) return; // superseded by a newer speak()

  const el = getAudio();
  el.src = url;
  const playResult = el.play();
  if (playResult && typeof playResult.catch === "function") {
    playResult.catch((err: unknown) => {
      if (requestId !== currentRequestId) return;
      const name = (err as { name?: string } | null)?.name;
      if (name === "NotAllowedError") {
        setSnapshot({ speaking: false, blocked: true });
      } else {
        speakWithBrowserFallback(text, lang);
      }
    });
  }
}

/**
 * Speaks `text` in `lang` ("hi" -> hi-IN, "en" -> en-IN — callers pass the
 * app's current UI language from i18n-context). Starting a new speak()
 * always stops whatever is currently playing first. A blank/whitespace-only
 * `text` is a no-op.
 *
 * Race safety: every call gets a monotonically increasing request id. If a
 * later speak() starts while an earlier one is still fetching, the earlier
 * result is still cached for reuse (the network call wasn't wasted) but is
 * never played.
 */
export async function speak(text: string, lang: Language): Promise<void> {
  const trimmed = text.trim();
  currentRequestId += 1;
  const requestId = currentRequestId;
  haltCurrentPlayback();

  if (!trimmed) {
    setSnapshot({ speaking: false, blocked: false });
    return;
  }

  setSnapshot({ speaking: true, blocked: false });

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) {
    speakWithBrowserFallback(trimmed, lang);
    return;
  }

  const cached = cacheGet(trimmed, lang);
  if (cached) {
    playUrl(cached, requestId, trimmed, lang);
    return;
  }

  let response: Response;
  try {
    response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, lang }),
    });
  } catch {
    if (requestId !== currentRequestId) return;
    speakWithBrowserFallback(trimmed, lang);
    return;
  }

  // Covers every non-2xx case, including /api/tts's 503 for mock-mode or a
  // missing key — never fabricate audio, just fall back.
  if (!response.ok) {
    if (requestId !== currentRequestId) return;
    speakWithBrowserFallback(trimmed, lang);
    return;
  }

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    if (requestId !== currentRequestId) return;
    speakWithBrowserFallback(trimmed, lang);
    return;
  }

  const url = URL.createObjectURL(blob);
  cacheSet(trimmed, lang, url);
  playUrl(url, requestId, trimmed, lang);
}

/** Stops whatever is currently speaking (server audio or browser
 * fallback) and invalidates any in-flight speak() so its result can never
 * start playing after the fact. */
export function stop(): void {
  currentRequestId += 1;
  haltCurrentPlayback();
  setSnapshot({ speaking: false, blocked: false });
}

function getSnapshot(): SpeechSnapshot {
  return snapshot;
}

// Module-level frozen constant: useSyncExternalStore requires
// getServerSnapshot to return a STABLE reference across calls (returning a
// fresh object every time makes React think the snapshot changed on every
// render and warn/loop), unlike getSnapshot's `snapshot` variable, whose
// identity legitimately changes on every setSnapshot(). The server-rendered
// snapshot always matches the module's initial client state, so there's no
// hydration mismatch to reconcile — it's just this one fixed value, frozen
// so nothing can accidentally mutate the shared object in place.
const SERVER_SNAPSHOT: SpeechSnapshot = Object.freeze({ speaking: false, blocked: false });

function getServerSnapshot(): SpeechSnapshot {
  return SERVER_SNAPSHOT;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface UseSpeech {
  speak: (text: string, lang: Language) => Promise<void>;
  stop: () => void;
  speaking: boolean;
  blocked: boolean;
}

/** Subscribes a component to the singleton player's state. `speak`/`stop`
 * are stable module-level function references (safe to use directly in
 * effect dependency arrays). */
export function useSpeech(): UseSpeech {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { speak, stop, speaking: state.speaking, blocked: state.blocked };
}
