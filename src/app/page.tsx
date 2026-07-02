"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import { usePartiesWithBalances } from "@/lib/useLedgerData";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PartyRow } from "@/components/PartyRow";
import { MicIcon, CameraIcon, PlusIcon } from "@/components/icons";

export default function HomePage() {
  const { t } = useI18n();
  const { data, loading } = usePartiesWithBalances();
  const [toast, setToast] = useState<string | null>(null);

  function showComingSoonToast() {
    setToast(t.common.comingSoon);
    window.setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-2">
        <h1 className="text-2xl font-extrabold text-green-800">{t.home.title}</h1>
        <LanguageToggle />
      </header>

      <main className="flex flex-1 flex-col gap-6 px-4 pb-6">
        {/* Primary voice entry — visually dominant but stubbed for Step 1. */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <button
            type="button"
            onClick={showComingSoonToast}
            aria-label={t.home.micHint}
            className="flex h-32 w-32 items-center justify-center rounded-full bg-green-600 text-white shadow-lg shadow-green-600/30 active:bg-green-700"
          >
            <MicIcon className="h-16 w-16" />
          </button>
          <p className="text-center text-sm text-neutral-500">{t.home.micHint}</p>
        </div>

        {/* Secondary stubbed entry point: photo of bill. */}
        <button
          type="button"
          onClick={showComingSoonToast}
          className="flex min-h-[56px] items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-4 text-neutral-500 active:bg-neutral-100"
        >
          <CameraIcon className="h-7 w-7" />
          <span className="text-base font-medium">{t.home.photoHint}</span>
        </button>

        {/* Party list with color-coded balances. */}
        <section className="flex flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-700">{t.home.partiesTitle}</h2>
          </div>

          {!loading && data.length === 0 && (
            <p className="rounded-2xl bg-neutral-50 px-4 py-6 text-center text-base text-neutral-400">
              {t.home.noParties}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {data.map(({ party, balancePaise }) => (
              <PartyRow key={party.id} party={party} balancePaise={balancePaise} />
            ))}
          </div>
        </section>
      </main>

      {/* Prominent manual "+" entry button, always reachable at the bottom. */}
      <div className="sticky bottom-0 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
        <Link
          href="/new"
          className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-lg font-bold text-white shadow-lg active:bg-neutral-800"
        >
          <PlusIcon className="h-7 w-7" />
          {t.home.addEntry}
        </Link>
      </div>

      {toast && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="rounded-xl bg-neutral-800 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
