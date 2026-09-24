"use client";

import { useI18n } from "@/lib/i18n-context";
import { useSpeech } from "@/lib/speech";
import { SpeakerIcon } from "./icons";
import type { Language } from "@/lib/i18n";

interface SpeakButtonProps {
  /** The text to (re)speak when tapped — always the CURRENT/latest value
   * relevant to the screen (e.g. the clarifying question while one is
   * pending, otherwise the confirmation sentence). */
  text: string;
  lang: Language;
  className?: string;
}

/** Round, >=56px tap target that (re)plays `text` through the shared
 * speech singleton (speech.ts). Gently pulses while audio is playing, and
 * bounces to invite a tap when the browser blocked autoplay. */
export function SpeakButton({ text, lang, className }: SpeakButtonProps) {
  const { t } = useI18n();
  const { speak, speaking, blocked } = useSpeech();

  return (
    <button
      type="button"
      onClick={() => {
        void speak(text, lang);
      }}
      aria-label={t.common.listen}
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-600 text-white shadow-md active:bg-green-700 ${
        speaking ? "animate-pulse" : ""
      } ${blocked ? "animate-bounce" : ""} ${className ?? ""}`}
    >
      <SpeakerIcon className="h-7 w-7" />
    </button>
  );
}
