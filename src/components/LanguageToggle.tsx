"use client";

import { useI18n } from "@/lib/i18n-context";

/** Simple हिं/EN toggle. Big enough tap target, always visible on Home. */
export function LanguageToggle() {
  const { language, toggleLanguage } = useI18n();

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label="Toggle language / भाषा बदलें"
      className="flex min-h-[44px] min-w-[64px] items-center justify-center rounded-full border-2 border-neutral-300 bg-white px-3 text-sm font-bold text-neutral-700 active:bg-neutral-100"
    >
      <span className={language === "hi" ? "text-green-700" : "text-neutral-400"}>हिं</span>
      <span className="mx-1 text-neutral-300">/</span>
      <span className={language === "en" ? "text-green-700" : "text-neutral-400"}>EN</span>
    </button>
  );
}
