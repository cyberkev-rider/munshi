"use client";

import Link from "next/link";
import { formatPaiseToRupees, theyOweYou } from "@/lib/ledger";
import { useI18n } from "@/lib/i18n-context";
import { PersonIcon } from "./icons";
import type { Party } from "@/lib/types";

interface PartyRowProps {
  party: Party;
  balancePaise: number;
}

/** One row in the Home party list: name, icon, and a color-coded balance.
 * Green + no special icon needed beyond color for "they owe you" (positive),
 * red for "you owe them" (negative) — money-flow icons live on the ledger
 * entries themselves, per the spec, so this row keeps to color + text. */
export function PartyRow({ party, balancePaise }: PartyRowProps) {
  const { t } = useI18n();
  const owesYou = theyOweYou(balancePaise);
  const isZero = balancePaise === 0;

  return (
    <Link
      href={`/party/${party.id}`}
      className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 active:bg-neutral-50"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        <PersonIcon className="h-7 w-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-semibold text-neutral-900">
          {party.name}
        </span>
        {isZero ? (
          <span className="block text-sm text-neutral-400">{t.home.settled}</span>
        ) : (
          <span className="block text-sm text-neutral-400">
            {owesYou ? t.home.balanceTheyOwe : t.home.balanceYouOwe}
          </span>
        )}
      </span>
      <span
        className={`amount-numerals shrink-0 text-xl font-bold ${
          isZero
            ? "text-neutral-400"
            : owesYou
              ? "text-green-600"
              : "text-red-600"
        }`}
      >
        {formatPaiseToRupees(Math.abs(balancePaise))}
      </span>
    </Link>
  );
}
