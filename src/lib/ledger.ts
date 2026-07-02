/**
 * Pure money-math module. No I/O, no Dexie, no React — just arithmetic and
 * formatting so it can be unit tested exhaustively and reused later from
 * anywhere (including future AI features that need to compute balances).
 *
 * All amounts in this module are integer paise. 1 rupee = 100 paise.
 */

import type { Transaction } from "./types";

/** Convert whole+fractional rupees (as typed by a user, e.g. "125.50") into
 * integer paise. Truncates any sub-paise precision defensively. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0;
  return Math.round(rupees * 100);
}

/** Convert integer paise into a rupee number (for math/display purposes
 * where a float is acceptable, e.g. feeding a chart). Prefer
 * formatPaiseToRupees for anything user-facing. */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Parses a raw amount string as typed on the custom number pad (e.g.
 * "125", "125.5", "125.") into integer paise, WITHOUT going through
 * floating point rupee math — it operates on the digit string directly so
 * there is no risk of binary float rounding (e.g. 0.1 + 0.2 style bugs).
 *
 * Accepts at most two digits after a single decimal point. Returns 0 for an
 * empty or invalid string.
 */
export function parseAmountInputToPaise(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === ".") return 0;

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  if (!/^\d*$/.test(wholePart) || !/^\d*$/.test(fractionPart)) return 0;

  const whole = wholePart === "" ? 0 : parseInt(wholePart, 10);
  // Pad/truncate the fractional part to exactly 2 digits (paise).
  const paiseFraction = fractionPart.padEnd(2, "0").slice(0, 2);
  const fraction = paiseFraction === "" ? 0 : parseInt(paiseFraction, 10);

  return whole * 100 + fraction;
}

/**
 * Signed contribution of a single transaction to a party's balance, in
 * paise. "received" (money coming in to the shop owner) is positive;
 * "paid" (money going out) is negative.
 */
export function signedAmount(tx: Pick<Transaction, "amount_paise" | "direction">): number {
  return tx.direction === "received" ? tx.amount_paise : -tx.amount_paise;
}

/**
 * Computes the running balance for a set of transactions belonging to one
 * party: SUM(received) - SUM(paid), in paise. Soft-deleted transactions
 * (is_deleted === true) are excluded. The result is never stored — always
 * recompute from the transaction list.
 *
 * A positive balance means the party owes the shop owner money (net
 * received is negative from the party's perspective... concretely: the shop
 * owner has received more than they paid, e.g. a customer who still owes
 * money conceptually shows here as the shop tracking what's due). Sign
 * convention: positive = net money IN to the shop owner, negative = net
 * money OUT.
 */
export function computeBalance(
  transactions: readonly Pick<Transaction, "amount_paise" | "direction" | "is_deleted">[]
): number {
  let total = 0;
  for (const tx of transactions) {
    if (tx.is_deleted) continue;
    total += signedAmount(tx);
  }
  return total;
}

/** Sum of all non-deleted "received" transactions, in paise. */
export function totalReceived(
  transactions: readonly Pick<Transaction, "amount_paise" | "direction" | "is_deleted">[]
): number {
  let total = 0;
  for (const tx of transactions) {
    if (tx.is_deleted || tx.direction !== "received") continue;
    total += tx.amount_paise;
  }
  return total;
}

/** Sum of all non-deleted "paid" transactions, in paise. */
export function totalPaid(
  transactions: readonly Pick<Transaction, "amount_paise" | "direction" | "is_deleted">[]
): number {
  let total = 0;
  for (const tx of transactions) {
    if (tx.is_deleted || tx.direction !== "paid") continue;
    total += tx.amount_paise;
  }
  return total;
}

/**
 * Formats integer paise as an Indian-locale rupee string, e.g. 250000 -> "₹2,500".
 * Uses en-IN digit grouping (lakh/crore style) with the rupee sign, no
 * decimal places (paise are hidden from the user in Step 1's UI — amounts
 * are entered/displayed in whole-rupee granularity for simplicity, but
 * stored precisely as paise).
 *
 * Negative amounts are formatted with a leading "-", e.g. -250000 -> "-₹2,500".
 */
export function formatPaiseToRupees(paise: number): string {
  const rupees = paiseToRupees(paise);
  const sign = rupees < 0 ? "-" : "";
  const absRupees = Math.abs(rupees);
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(absRupees);
  return `${sign}₹${formatted}`;
}

/** Whether a balance is "positive" (net received) for color-coding purposes. */
export function isPositiveBalance(balancePaise: number): boolean {
  return balancePaise >= 0;
}
