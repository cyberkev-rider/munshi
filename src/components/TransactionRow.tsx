"use client";

import { formatPaiseToRupees } from "@/lib/ledger";
import { useI18n } from "@/lib/i18n-context";
import { entryText } from "@/lib/readback";
import { useSpeech } from "@/lib/speech";
import { MoneyInIcon, MoneyOutIcon, TrashIcon } from "./icons";
import type { Transaction } from "@/lib/types";

interface TransactionRowProps {
  transaction: Transaction;
  /** The owning party's name. Transaction only stores party_id, but the
   * Step 3 spoken read-back (entryText) needs the name in its sentence, so
   * the party ledger page threads it down here. */
  partyName: string;
  onDelete: (id: string) => void;
}

function formatEntryDate(iso: string, todayLabel: string, yesterdayLabel: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return todayLabel;
  if (diffDays === 1) return yesterdayLabel;

  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** One row in the party ledger: color-coded icon, amount, date, optional
 * note, and a delete action (soft delete — undo is offered by the parent
 * via a snackbar after the delete happens).
 *
 * Step 3: tapping the row's body speaks it back via entryText, since many
 * users confirm entries by ear rather than reading them. The delete button
 * is a separate SIBLING button (not nested inside the speak button — HTML
 * forbids nested buttons anyway), so deleting never triggers speech. */
export function TransactionRow({ transaction, partyName, onDelete }: TransactionRowProps) {
  const { t, language } = useI18n();
  const { speak } = useSpeech();
  const isReceived = transaction.direction === "received";
  const timeLabel = new Date(transaction.created_at).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });

  function handleSpeak() {
    const text = entryText(
      {
        party: partyName,
        amountPaise: transaction.amount_paise,
        direction: transaction.direction,
        note: transaction.note,
        createdAt: transaction.created_at,
      },
      language,
      new Date()
    );
    void speak(text, language);
  }

  return (
    <div className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2">
      <button
        type="button"
        onClick={handleSpeak}
        aria-label={t.common.listen}
        className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            isReceived ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
          }`}
        >
          {isReceived ? <MoneyInIcon className="h-6 w-6" /> : <MoneyOutIcon className="h-6 w-6" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-xs text-neutral-400">
            {formatEntryDate(transaction.created_at, t.ledger.dateToday, t.ledger.dateYesterday)}
            {" · "}
            {timeLabel}
          </span>
          {transaction.note && (
            <span className="block truncate text-sm text-neutral-600">{transaction.note}</span>
          )}
        </span>

        <span
          className={`amount-numerals shrink-0 text-lg font-bold ${
            isReceived ? "text-green-600" : "text-red-600"
          }`}
        >
          {isReceived ? "+" : "-"}
          {formatPaiseToRupees(transaction.amount_paise)}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onDelete(transaction.id)}
        aria-label={t.common.delete}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-400 active:bg-neutral-100"
      >
        <TrashIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
