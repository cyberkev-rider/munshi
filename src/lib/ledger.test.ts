import { describe, it, expect } from "vitest";
import {
  rupeesToPaise,
  paiseToRupees,
  parseAmountInputToPaise,
  signedAmount,
  computeBalance,
  totalReceived,
  totalPaid,
  formatPaiseToRupees,
  theyOweYou,
} from "./ledger";
import type { Transaction } from "./types";

/** Minimal helper to build a fake transaction for tests without needing
 * every field on the full Transaction type. */
function tx(
  amount_paise: number,
  direction: "paid" | "received",
  is_deleted = false
): Pick<Transaction, "amount_paise" | "direction" | "is_deleted"> {
  return { amount_paise, direction, is_deleted };
}

describe("rupeesToPaise / paiseToRupees", () => {
  it("converts whole rupees to paise", () => {
    expect(rupeesToPaise(100)).toBe(10000);
  });

  it("converts fractional rupees to paise", () => {
    expect(rupeesToPaise(125.5)).toBe(12550);
  });

  it("rounds sub-paise precision defensively", () => {
    expect(rupeesToPaise(10.005)).toBe(1001); // rounds to nearest paise
  });

  it("returns 0 for non-finite input", () => {
    expect(rupeesToPaise(NaN)).toBe(0);
    expect(rupeesToPaise(Infinity)).toBe(0);
  });

  it("round-trips paise back to rupees", () => {
    expect(paiseToRupees(12550)).toBeCloseTo(125.5);
  });
});

describe("parseAmountInputToPaise", () => {
  it("parses a whole number string", () => {
    expect(parseAmountInputToPaise("125")).toBe(12500);
  });

  it("parses a string with two decimal digits", () => {
    expect(parseAmountInputToPaise("125.50")).toBe(12550);
  });

  it("parses a string with one decimal digit as tens of paise", () => {
    expect(parseAmountInputToPaise("125.5")).toBe(12550);
  });

  it("parses a trailing decimal point with no digits after it", () => {
    expect(parseAmountInputToPaise("125.")).toBe(12500);
  });

  it("parses an empty string as 0", () => {
    expect(parseAmountInputToPaise("")).toBe(0);
  });

  it("parses a lone decimal point as 0", () => {
    expect(parseAmountInputToPaise(".")).toBe(0);
  });

  it("truncates more than two fractional digits to paise precision", () => {
    expect(parseAmountInputToPaise("10.999")).toBe(1099);
  });

  it("never produces float rounding artifacts for repeating-decimal-prone values", () => {
    // classic float trap: 0.1 + 0.2 !== 0.3 in binary float. Confirm the
    // string-based parser sidesteps this entirely.
    expect(parseAmountInputToPaise("0.10")).toBe(10);
    expect(parseAmountInputToPaise("0.20")).toBe(20);
    expect(parseAmountInputToPaise("0.30")).toBe(30);
  });

  it("rejects non-numeric input as 0", () => {
    expect(parseAmountInputToPaise("abc")).toBe(0);
  });
});

describe("signedAmount", () => {
  it("is positive for received", () => {
    expect(signedAmount(tx(5000, "received"))).toBe(5000);
  });

  it("is negative for paid", () => {
    expect(signedAmount(tx(5000, "paid"))).toBe(-5000);
  });
});

describe("computeBalance", () => {
  it("computes zero balance with no transactions", () => {
    expect(computeBalance([])).toBe(0);
  });

  it("computes balance with only received transactions", () => {
    const txs = [tx(10000, "received"), tx(5000, "received")];
    expect(computeBalance(txs)).toBe(15000);
  });

  it("computes balance with only paid transactions", () => {
    const txs = [tx(10000, "paid"), tx(5000, "paid")];
    expect(computeBalance(txs)).toBe(-15000);
  });

  it("computes balance with mixed paid/received transactions", () => {
    // received 200 (20000p), paid 75.50 (7550p), received 10 (1000p)
    const txs = [
      tx(20000, "received"),
      tx(7550, "paid"),
      tx(1000, "received"),
    ];
    // 20000 - 7550 + 1000 = 13450
    expect(computeBalance(txs)).toBe(13450);
  });

  it("excludes soft-deleted transactions from the balance", () => {
    const txs = [
      tx(20000, "received"),
      tx(50000, "paid", true), // deleted — must be excluded
      tx(1000, "received"),
    ];
    expect(computeBalance(txs)).toBe(21000);
  });

  it("returns a balance unaffected by deleted-only ledgers", () => {
    const txs = [tx(20000, "received", true), tx(5000, "paid", true)];
    expect(computeBalance(txs)).toBe(0);
  });

  it("can produce a negative net balance (party owed money)", () => {
    const txs = [tx(1000, "received"), tx(5000, "paid")];
    expect(computeBalance(txs)).toBe(-4000);
  });
});

describe("totalReceived / totalPaid", () => {
  it("sums only received amounts, excluding deleted", () => {
    const txs = [
      tx(10000, "received"),
      tx(5000, "paid"),
      tx(2000, "received", true),
    ];
    expect(totalReceived(txs)).toBe(10000);
  });

  it("sums only paid amounts, excluding deleted", () => {
    const txs = [
      tx(10000, "received"),
      tx(5000, "paid"),
      tx(2000, "paid", true),
    ];
    expect(totalPaid(txs)).toBe(5000);
  });
});

describe("formatPaiseToRupees", () => {
  it("formats a simple amount with Indian digit grouping", () => {
    expect(formatPaiseToRupees(250000)).toBe("₹2,500");
  });

  it("formats a lakh-scale amount with Indian grouping (not Western)", () => {
    // 12,34,567 rupees -> Indian grouping groups by 2s after the first 3 digits
    expect(formatPaiseToRupees(123456700)).toBe("₹12,34,567");
  });

  it("formats zero", () => {
    expect(formatPaiseToRupees(0)).toBe("₹0");
  });

  it("formats amounts under one rupee (rounded to nearest rupee for display)", () => {
    expect(formatPaiseToRupees(50)).toBe("₹1");
  });

  it("formats negative amounts with a leading minus sign", () => {
    expect(formatPaiseToRupees(-250000)).toBe("-₹2,500");
  });

  it("has no decimal places", () => {
    expect(formatPaiseToRupees(150)).not.toContain(".");
  });
});

describe("theyOweYou (Khatabook udhaar convention)", () => {
  it("money the owner gave (net paid, negative balance) means they owe you", () => {
    expect(theyOweYou(-100)).toBe(true);
  });

  it("money the owner received (net received, positive balance) means you owe them", () => {
    expect(theyOweYou(100)).toBe(false);
  });

  it("treats zero as they-owe-you (green) for color-coding only", () => {
    expect(theyOweYou(0)).toBe(true);
  });
});
