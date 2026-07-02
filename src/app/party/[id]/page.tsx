"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n-context";
import { usePartyLedger } from "@/lib/useLedgerData";
import { getParty, softDeleteTransaction, undoDeleteTransaction } from "@/lib/repo";
import { formatPaiseToRupees, isPositiveBalance } from "@/lib/ledger";
import { useSnackbar } from "@/components/Snackbar";
import { TransactionRow } from "@/components/TransactionRow";
import { BackIcon, PlusIcon } from "@/components/icons";
import type { Party } from "@/lib/types";

export default function PartyLedgerPage() {
  const params = useParams<{ id: string }>();
  const partyId = typeof params.id === "string" ? params.id : undefined;
  const router = useRouter();
  const { t } = useI18n();
  const { show } = useSnackbar();

  const [party, setParty] = useState<Party | null | undefined>(undefined);
  const { transactions, balancePaise, refresh } = usePartyLedger(partyId);

  useEffect(() => {
    if (!partyId) return;
    getParty(partyId).then((p) => setParty(p ?? null));
  }, [partyId]);

  async function handleDelete(id: string) {
    await softDeleteTransaction(id);
    await refresh();
    show(t.snackbar.deleted, {
      undoLabel: t.common.undo,
      onUndo: async () => {
        await undoDeleteTransaction(id);
        await refresh();
      },
    });
  }

  const positive = isPositiveBalance(balancePaise);
  const isZero = balancePaise === 0;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-2 px-2 pt-[max(env(safe-area-inset-top),1rem)] pb-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label={t.common.back}
          className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-full text-neutral-600 active:bg-neutral-100"
        >
          <BackIcon className="h-7 w-7" />
        </button>
        <h1 className="truncate text-lg font-bold text-neutral-800">
          {party ? party.name : t.ledger.title}
        </h1>
      </header>

      <div className="flex flex-col items-center gap-1 border-b border-neutral-100 px-4 py-5">
        <span className="text-sm text-neutral-400">{t.ledger.balanceTitle}</span>
        <span
          className={`amount-numerals text-4xl font-extrabold ${
            isZero ? "text-neutral-500" : positive ? "text-green-600" : "text-red-600"
          }`}
        >
          {formatPaiseToRupees(Math.abs(balancePaise))}
        </span>
        {!isZero && (
          <span className="text-sm font-medium text-neutral-400">
            {positive ? t.home.balanceTheyOwe : t.home.balanceYouOwe}
          </span>
        )}
      </div>

      <main className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
        {transactions.length === 0 && (
          <p className="rounded-2xl bg-neutral-50 px-4 py-6 text-center text-base text-neutral-400">
            {t.ledger.noEntries}
          </p>
        )}
        {transactions.map((tx) => (
          <TransactionRow key={tx.id} transaction={tx} onDelete={handleDelete} />
        ))}
      </main>

      {partyId && (
        <div className="sticky bottom-0 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          <Link
            href={{ pathname: "/new" }}
            className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-lg font-bold text-white shadow-lg active:bg-neutral-800"
          >
            <PlusIcon className="h-7 w-7" />
            {t.home.addEntry}
          </Link>
        </div>
      )}
    </div>
  );
}
