"use client";

/**
 * React hooks that connect the pure ledger math (ledger.ts) and the data
 * access layer (repo.ts) to components, keeping components free of direct
 * Dexie calls. Each hook exposes a `refresh` function so callers can
 * re-fetch after a mutation (create/delete/undo) without a full page reload.
 */

import { useCallback, useEffect, useState } from "react";
import { computeBalance } from "./ledger";
import {
  listAllActiveTransactions,
  listParties,
  listTransactionsForParty,
} from "./repo";
import type { Party, Transaction } from "./types";

export interface PartyWithBalance {
  party: Party;
  balancePaise: number;
}

/** Loads every party along with its computed running balance, sorted by
 * most-recently-created party first. */
export function usePartiesWithBalances() {
  const [data, setData] = useState<PartyWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [parties, transactions] = await Promise.all([
      listParties(),
      listAllActiveTransactions(),
    ]);
    const byParty = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const list = byParty.get(tx.party_id) ?? [];
      list.push(tx);
      byParty.set(tx.party_id, list);
    }
    const result: PartyWithBalance[] = parties.map((party) => ({
      party,
      balancePaise: computeBalance(byParty.get(party.id) ?? []),
    }));
    setData(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Intentional fetch-on-mount; refresh() flips loading before awaiting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { data, loading, refresh };
}

/** Loads a single party's transaction history plus its running balance. */
export function usePartyLedger(partyId: string | undefined) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!partyId) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const txs = await listTransactionsForParty(partyId);
    setTransactions(txs);
    setLoading(false);
  }, [partyId]);

  useEffect(() => {
    // Intentional fetch-on-mount; refresh() flips loading before awaiting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const balancePaise = computeBalance(transactions);

  return { transactions, balancePaise, loading, refresh };
}
