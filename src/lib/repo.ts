/**
 * Data access layer. Wraps Dexie with the app's business rules: id/timestamp
 * generation, soft-delete semantics, and the "synced" flag every record is
 * born with (always false for now — Step 1 has no server sync).
 *
 * Keeping this separate from db.ts (raw Dexie schema) and ledger.ts (pure
 * math) means a future sync engine can be slotted in here without touching
 * either of those modules.
 */

import { db } from "./db";
import type { NewParty, NewTransaction, Party, Transaction } from "./types";

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Creates a new party and persists it immediately. */
export async function createParty(input: NewParty): Promise<Party> {
  const party: Party = {
    id: newId(),
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    created_at: nowIso(),
    synced: false,
  };
  await db.parties.add(party);
  return party;
}

/** Returns all parties, newest first. */
export async function listParties(): Promise<Party[]> {
  const parties = await db.parties.toArray();
  return parties.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Returns a single party by id, or undefined if not found. */
export async function getParty(id: string): Promise<Party | undefined> {
  return db.parties.get(id);
}

/** Creates a new transaction and persists it immediately. Defaults source
 * to "manual" (Step 1's only supported entry method). */
export async function createTransaction(
  input: NewTransaction
): Promise<Transaction> {
  const transaction: Transaction = {
    id: newId(),
    party_id: input.party_id,
    amount_paise: input.amount_paise,
    direction: input.direction,
    note: input.note?.trim() || undefined,
    source: input.source ?? "manual",
    raw_text: input.raw_text || undefined,
    confidence: input.confidence,
    created_at: nowIso(),
    is_deleted: false,
    synced: false,
  };
  await db.transactions.add(transaction);
  return transaction;
}

/** Returns all non-deleted transactions for a party, newest first. */
export async function listTransactionsForParty(
  partyId: string
): Promise<Transaction[]> {
  const txs = await db.transactions
    .where("party_id")
    .equals(partyId)
    .toArray();
  return txs
    .filter((t) => !t.is_deleted)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Returns ALL non-deleted transactions across every party (used to compute
 * each party's balance on the home screen without N separate queries). */
export async function listAllActiveTransactions(): Promise<Transaction[]> {
  const txs = await db.transactions.toArray();
  return txs.filter((t) => !t.is_deleted);
}

/** Soft-deletes a transaction (excluded from balances/lists but kept in
 * storage so it can be restored via undoDeleteTransaction). */
export async function softDeleteTransaction(id: string): Promise<void> {
  await db.transactions.update(id, { is_deleted: true });
}

/** Restores a soft-deleted transaction. Powers the "undo" snackbar action
 * after a delete. */
export async function undoDeleteTransaction(id: string): Promise<void> {
  await db.transactions.update(id, { is_deleted: false });
}

/** Permanently removes a transaction. Powers the "undo" snackbar action
 * after a save (undoing a save fully removes the just-created entry rather
 * than merely soft-deleting it, since it was never meant to exist). */
export async function deleteTransactionPermanently(id: string): Promise<void> {
  await db.transactions.delete(id);
}
