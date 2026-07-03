import { describe, it, expect } from "vitest";
import { computeFieldReviewFlags } from "./voice-confirm-helpers";

const notEdited = { partyEdited: false, amountEdited: false };

describe("computeFieldReviewFlags", () => {
  it("flags nothing for a clean, matched, high-confidence result", () => {
    const flags = computeFieldReviewFlags(
      { partyMatched: true, amountDisagreement: undefined, confidence: 0.95 },
      notEdited
    );
    expect(flags).toEqual({ party: false, amount: false });
  });

  it("flags the party when it wasn't matched to an existing contact", () => {
    const flags = computeFieldReviewFlags(
      { partyMatched: false, amountDisagreement: undefined, confidence: 0.95 },
      notEdited
    );
    expect(flags.party).toBe(true);
    expect(flags.amount).toBe(false);
  });

  it("flags the amount when there's a disagreement, even with high confidence", () => {
    const flags = computeFieldReviewFlags(
      {
        partyMatched: true,
        amountDisagreement: { llmAmountPaise: 40_000, deterministicAmountPaise: 50_000 },
        confidence: 0.9,
      },
      notEdited
    );
    expect(flags.amount).toBe(true);
    expect(flags.party).toBe(false);
  });

  it("flags the amount when confidence is below the review threshold, with no disagreement", () => {
    const flags = computeFieldReviewFlags(
      { partyMatched: true, amountDisagreement: undefined, confidence: 0.5 },
      notEdited
    );
    expect(flags.amount).toBe(true);
  });

  it("does not flag the amount when confidence is high and there's no disagreement", () => {
    const flags = computeFieldReviewFlags(
      { partyMatched: true, amountDisagreement: undefined, confidence: 0.99 },
      notEdited
    );
    expect(flags.amount).toBe(false);
  });

  it("clears the party flag once the user has edited the party field", () => {
    const flags = computeFieldReviewFlags(
      { partyMatched: false, amountDisagreement: undefined, confidence: 0.95 },
      { partyEdited: true, amountEdited: false }
    );
    expect(flags.party).toBe(false);
  });

  it("clears the amount flag once the user has edited the amount field, even with a disagreement", () => {
    const flags = computeFieldReviewFlags(
      {
        partyMatched: true,
        amountDisagreement: { llmAmountPaise: 40_000, deterministicAmountPaise: 50_000 },
        confidence: 0.5,
      },
      { partyEdited: false, amountEdited: true }
    );
    expect(flags.amount).toBe(false);
  });

  it("flags both fields when both are unresolved", () => {
    const flags = computeFieldReviewFlags(
      {
        partyMatched: false,
        amountDisagreement: { llmAmountPaise: 1, deterministicAmountPaise: 2 },
        confidence: 0.3,
      },
      notEdited
    );
    expect(flags).toEqual({ party: true, amount: true });
  });
});
