/**
 * Core data model for Munshi's single-entry party ledger.
 *
 * IMPORTANT: This is NOT double-entry bookkeeping. Each transaction simply
 * records money paid to, or received from, a "party" (a customer/supplier/
 * contact). The running balance for a party is always COMPUTED from its
 * transactions — never stored — so it can never drift out of sync.
 *
 * All money is stored as integer paise (1 rupee = 100 paise) to avoid any
 * floating point rounding issues. Never store rupee decimals.
 */

/** Direction of money movement relative to the shop owner (the app's user). */
export type TransactionDirection = "paid" | "received";

/** How a transaction was captured. Only "manual" is implemented in Step 1;
 * "voice" and "photo" are reserved for future AI-assisted capture (STT/OCR)
 * so the schema does not need to change when those land. */
export type TransactionSource = "manual" | "voice" | "photo";

/** A person or business the shop owner exchanges money with. */
export interface Party {
  /** UUID v4, generated client-side. */
  id: string;
  name: string;
  /** Optional phone number, digits only or as entered. */
  phone?: string;
  /** ISO-8601 timestamp string. */
  created_at: string;
  /** Sync-readiness flag for a future server sync feature. Not used yet. */
  synced: boolean;
}

/** A single money movement tied to a party. */
export interface Transaction {
  /** UUID v4, generated client-side. */
  id: string;
  party_id: string;
  /** Integer number of paise. Always >= 0; direction carries the sign. */
  amount_paise: number;
  direction: TransactionDirection;
  note?: string;
  source: TransactionSource;
  /** Step 2 (voice capture): the raw STT transcript this entry was parsed
   * from. Only set when source === "voice". Kept verbatim (not translated)
   * so the confirm screen can show it back to the user for a sanity check,
   * and so a human can audit what the LLM extracted from. */
  raw_text?: string;
  /** Step 2 (voice capture): the LLM extraction's self-reported confidence
   * (0-1) for this parse. Only set when source === "voice". Not used for
   * anything beyond record-keeping once the user has confirmed/edited the
   * entry — by the time it's saved, the user has already vetted the fields. */
  confidence?: number;
  /** ISO-8601 timestamp string. */
  created_at: string;
  /** Soft-delete flag. Deleted transactions are excluded from balances and
   * lists, but kept in storage so an "undo" can restore them. */
  is_deleted: boolean;
  /** Sync-readiness flag for a future server sync feature. Not used yet. */
  synced: boolean;
}

/** Input shape for creating a new party (fields the caller must supply). */
export type NewParty = Pick<Party, "name"> & Partial<Pick<Party, "phone">>;

/** Input shape for creating a new transaction (fields the caller must supply). */
export type NewTransaction = Pick<
  Transaction,
  "party_id" | "amount_paise" | "direction"
> &
  Partial<Pick<Transaction, "note" | "source" | "raw_text" | "confidence">>;
