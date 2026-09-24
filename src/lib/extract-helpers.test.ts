import { describe, it, expect } from "vitest";
import {
  crossCheckAmount,
  matchPartyName,
  validateExtraction,
  buildExtractResult,
  sanitizeModelText,
  CONFIDENCE_REVIEW_THRESHOLD,
  type RawExtraction,
} from "./extract-helpers";

describe("crossCheckAmount", () => {
  it("keeps the LLM amount when it agrees with the deterministic parse", () => {
    const result = crossCheckAmount("Ramesh ko paanch sau rupaye diye", 50_000);
    expect(result.amount_paise).toBe(50_000);
    expect(result.disagreement).toBeUndefined();
    expect(result.confidencePenalty).toBe(0);
  });

  it("prefers the deterministic parse when the LLM disagrees", () => {
    // LLM says 400 rupees, but the transcript mechanically says "paanch sau" = 500.
    const result = crossCheckAmount("Ramesh ko paanch sau rupaye diye", 40_000);
    expect(result.amount_paise).toBe(50_000);
    expect(result.disagreement).toEqual({
      llmAmountPaise: 40_000,
      deterministicAmountPaise: 50_000,
    });
    expect(result.confidencePenalty).toBeGreaterThan(0);
  });

  it("trusts the LLM when no deterministic parse is possible", () => {
    const result = crossCheckAmount("Ramesh ko kuch rupaye diye", 12_345);
    expect(result.amount_paise).toBe(12_345);
    expect(result.disagreement).toBeUndefined();
    expect(result.confidencePenalty).toBe(0);
  });

  it("handles dhai hazaar cross-check agreement", () => {
    const result = crossCheckAmount("dhai hazaar diye Ramesh ko", 250_000);
    expect(result.amount_paise).toBe(250_000);
    expect(result.disagreement).toBeUndefined();
  });

  it("picks the largest amount when transcript has a remainder mention", () => {
    const result = crossCheckAmount(
      "Mohan ko 2 thousand 5 hundred diye, baaki 500 udhaar",
      250_000
    );
    expect(result.amount_paise).toBe(250_000);
    expect(result.disagreement).toBeUndefined();
  });
});

describe("matchPartyName", () => {
  const existing = ["Ramesh", "Suresh Kumar", "Mohan"];

  it("matches an exact name case-insensitively", () => {
    expect(matchPartyName("ramesh", existing)).toEqual({ name: "Ramesh", matched: true });
  });

  it("matches with surrounding whitespace", () => {
    expect(matchPartyName("  Ramesh  ", existing)).toEqual({ name: "Ramesh", matched: true });
  });

  it("fuzzy-matches 'Ramesh bhai' to existing 'Ramesh'", () => {
    expect(matchPartyName("Ramesh bhai", existing)).toEqual({ name: "Ramesh", matched: true });
  });

  it("fuzzy-matches a partial name against a longer existing name", () => {
    expect(matchPartyName("Suresh", existing)).toEqual({ name: "Suresh Kumar", matched: true });
  });

  it("returns unmatched for a genuinely new name", () => {
    expect(matchPartyName("Deepak", existing)).toEqual({ name: "Deepak", matched: false });
  });

  it("does not fuzzy-match very short unrelated names", () => {
    // "Mo" is < 3 chars — should not spuriously match "Mohan".
    expect(matchPartyName("Mo", existing)).toEqual({ name: "Mo", matched: false });
  });

  it("returns unmatched (not crashing) on an empty extracted name", () => {
    expect(matchPartyName("", existing)).toEqual({ name: "", matched: false });
  });

  it("handles an empty existing-parties list", () => {
    expect(matchPartyName("Ramesh", [])).toEqual({ name: "Ramesh", matched: false });
  });
});

describe("validateExtraction", () => {
  it("returns no problems for a fully valid extraction", () => {
    const raw: RawExtraction = {
      party: "Ramesh",
      existing_party: "",
      amount_paise: 50_000,
      direction: "paid",
      note: "",
      confidence: 0.9,
    };
    expect(validateExtraction(raw)).toEqual([]);
  });

  it("flags a missing party", () => {
    expect(
      validateExtraction({ amount_paise: 100, direction: "paid", note: "", confidence: 0.9 })
    ).toContain("party");
  });

  it("flags an empty-string party", () => {
    expect(
      validateExtraction({ party: "   ", amount_paise: 100, direction: "paid", confidence: 0.9 })
    ).toContain("party");
  });

  it("flags a zero or negative amount", () => {
    expect(
      validateExtraction({ party: "Ramesh", amount_paise: 0, direction: "paid", confidence: 0.9 })
    ).toContain("amount_paise");
    expect(
      validateExtraction({ party: "Ramesh", amount_paise: -500, direction: "paid", confidence: 0.9 })
    ).toContain("amount_paise");
  });

  it("flags a missing amount", () => {
    expect(validateExtraction({ party: "Ramesh", direction: "paid", confidence: 0.9 })).toContain(
      "amount_paise"
    );
  });

  it("flags an invalid direction", () => {
    expect(
      // @ts-expect-error — intentionally invalid to test the guard
      validateExtraction({ party: "Ramesh", amount_paise: 100, direction: "sideways", confidence: 0.9 })
    ).toContain("direction");
  });

  it("can flag multiple problems at once", () => {
    const problems = validateExtraction({ amount_paise: -1 });
    expect(problems).toContain("party");
    expect(problems).toContain("amount_paise");
    expect(problems).toContain("direction");
  });
});

describe("buildExtractResult", () => {
  const existingParties = ["Ramesh", "Suresh"];

  it("builds a clean, high-confidence result with no review needed", () => {
    const raw: RawExtraction = {
      party: "Ramesh",
      existing_party: "",
      amount_paise: 50_000,
      direction: "paid",
      note: "",
      confidence: 0.95,
    };
    const result = buildExtractResult(raw, "Ramesh ko paanch sau rupaye diye", existingParties);
    expect(result).toMatchObject({
      party: "Ramesh",
      partyMatched: true,
      amount_paise: 50_000,
      direction: "paid",
      confidence: 0.95,
      needsReview: false,
    });
    expect(result.amountDisagreement).toBeUndefined();
  });

  it("flags needsReview when confidence is below threshold", () => {
    const raw: RawExtraction = {
      party: "Ramesh",
      existing_party: "",
      amount_paise: 50_000,
      direction: "paid",
      note: "",
      confidence: 0.5,
    };
    const result = buildExtractResult(raw, "Ramesh ko paanch sau rupaye diye", existingParties);
    expect(result.needsReview).toBe(true);
    expect(result.confidence).toBe(0.5);
    expect(result.confidence).toBeLessThan(CONFIDENCE_REVIEW_THRESHOLD);
  });

  it("flags needsReview and overrides amount when the deterministic parse disagrees", () => {
    const raw: RawExtraction = {
      party: "Ramesh",
      existing_party: "",
      amount_paise: 40_000, // wrong — transcript mechanically says 500 rupees
      direction: "paid",
      note: "",
      confidence: 0.9,
    };
    const result = buildExtractResult(raw, "Ramesh ko paanch sau rupaye diye", existingParties);
    expect(result.amount_paise).toBe(50_000);
    expect(result.amountDisagreement).toEqual({
      llmAmountPaise: 40_000,
      deterministicAmountPaise: 50_000,
    });
    expect(result.needsReview).toBe(true);
  });

  it("flags needsReview when a required field is missing, even with high confidence", () => {
    const raw = {
      party: "",
      existing_party: "",
      amount_paise: 50_000,
      direction: "paid" as const,
      note: "",
      confidence: 0.99,
    };
    const result = buildExtractResult(raw, "kuch diya", existingParties);
    expect(result.needsReview).toBe(true);
  });

  it("carries through the note field verbatim", () => {
    const raw: RawExtraction = {
      party: "Mohan",
      existing_party: "",
      amount_paise: 250_000,
      direction: "paid",
      note: "baaki 500 udhaar",
      confidence: 0.85,
    };
    const result = buildExtractResult(
      raw,
      "Mohan ko 2 thousand 5 hundred diye, baaki 500 udhaar",
      existingParties
    );
    expect(result.note).toBe("baaki 500 udhaar");
  });

  it("marks partyMatched false and keeps the raw name for a new party", () => {
    const raw: RawExtraction = {
      party: "Deepak",
      existing_party: "",
      amount_paise: 10_000,
      direction: "received",
      note: "",
      confidence: 0.9,
    };
    const result = buildExtractResult(raw, "Deepak se sau rupaye aaye", existingParties);
    expect(result.party).toBe("Deepak");
    expect(result.partyMatched).toBe(false);
  });

  it("clamps confidence to [0, 1] after penalty", () => {
    const raw: RawExtraction = {
      party: "Ramesh",
      existing_party: "",
      amount_paise: 1, // will disagree heavily, incurring a penalty
      direction: "paid",
      note: "",
      confidence: 0.1,
    };
    const result = buildExtractResult(raw, "Ramesh ko paanch sau rupaye diye", existingParties);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("defaults an invalid direction to 'paid' defensively", () => {
    const raw = {
      party: "Ramesh",
      amount_paise: 100,
      note: "",
      confidence: 0.9,
    } as unknown as RawExtraction;
    const result = buildExtractResult(raw, "Ramesh ko sau rupaye diye", existingParties);
    expect(result.direction).toBe("paid");
    expect(result.needsReview).toBe(true);
  });
});

describe("buildExtractResult — existing_party (model-proposed match)", () => {
  const existingParties = ["Ramesh", "Suresh", "Mohan"];

  it("accepts an exact-member existing_party and uses its canonical spelling", () => {
    const raw: RawExtraction = {
      party: "सुरेश",
      existing_party: "Suresh",
      amount_paise: 300_000,
      direction: "received",
      note: "",
      confidence: 0.9,
    };
    const result = buildExtractResult(raw, "सुरेश से तीन हज़ार रुपये आए", existingParties);
    expect(result.party).toBe("Suresh");
    expect(result.partyMatched).toBe(true);
  });

  it("accepts existing_party case-insensitively", () => {
    const raw: RawExtraction = {
      party: "suresh bhai",
      existing_party: "suresh", // right party, wrong casing from the model
      amount_paise: 300_000,
      direction: "received",
      note: "",
      confidence: 0.9,
    };
    const result = buildExtractResult(raw, "suresh bhai se 3000 aaye", existingParties);
    expect(result.party).toBe("Suresh"); // canonical spelling from the list, not the model's casing
    expect(result.partyMatched).toBe(true);
  });

  it("ignores a non-member existing_party and falls back to fuzzy matchPartyName on `party`", () => {
    const raw: RawExtraction = {
      party: "Ramesh bhai",
      existing_party: "Someone Else", // not a list member — must never be trusted
      amount_paise: 50_000,
      direction: "paid",
      note: "",
      confidence: 0.9,
    };
    const result = buildExtractResult(raw, "Ramesh bhai ko paanch sau diye", existingParties);
    expect(result.party).toBe("Ramesh");
    expect(result.partyMatched).toBe(true);
  });

  it("ignores a junk existing_party (the observed serialization glitch) and falls back", () => {
    const raw: RawExtraction = {
      party: "Deepak",
      existing_party: "</antmlःparameter>\n",
      amount_paise: 10_000,
      direction: "received",
      note: "",
      confidence: 0.9,
    };
    const result = buildExtractResult(raw, "Deepak se sau rupaye aaye", existingParties);
    expect(result.party).toBe("Deepak");
    expect(result.partyMatched).toBe(false);
  });

  it("treats an empty existing_party as no match, falling back to matchPartyName", () => {
    const raw: RawExtraction = {
      party: "Ramesh",
      existing_party: "",
      amount_paise: 50_000,
      direction: "paid",
      note: "",
      confidence: 0.9,
    };
    const result = buildExtractResult(raw, "Ramesh ko paanch sau rupaye diye", existingParties);
    expect(result.party).toBe("Ramesh");
    expect(result.partyMatched).toBe(true);
  });
});

describe("buildExtractResult — sanitizes junk model output", () => {
  const existingParties = ["Ramesh", "Suresh", "Mohan"];

  it("sanitizes the exact observed junk string out of party, flagging needsReview", () => {
    const raw: RawExtraction = {
      party: "</antmlःparameter>\n",
      existing_party: "",
      amount_paise: 50_000,
      direction: "paid",
      note: "",
      confidence: 0.95,
    };
    const result = buildExtractResult(raw, "kuch paanch sau diye", existingParties);
    expect(result.party).toBe("");
    expect(result.needsReview).toBe(true);
  });

  it("sanitizes the exact observed junk string out of note without touching a real party/amount", () => {
    const raw: RawExtraction = {
      party: "Ramesh",
      existing_party: "",
      amount_paise: 50_000,
      direction: "paid",
      note: "</antmlःparameter>\n",
      confidence: 0.95,
    };
    const result = buildExtractResult(raw, "Ramesh ko paanch sau rupaye diye", existingParties);
    expect(result.note).toBe("");
    expect(result.party).toBe("Ramesh");
    expect(result.needsReview).toBe(false);
  });

  it("leaves a real note completely untouched", () => {
    const raw: RawExtraction = {
      party: "Mohan",
      existing_party: "Mohan",
      amount_paise: 250_000,
      direction: "paid",
      note: "baaki 500 udhaar",
      confidence: 0.9,
    };
    const result = buildExtractResult(raw, "Mohan ko dhai hazaar diye, baaki 500 udhaar", existingParties);
    expect(result.note).toBe("baaki 500 udhaar");
    expect(result.party).toBe("Mohan");
    expect(result.partyMatched).toBe(true);
  });
});

describe("sanitizeModelText", () => {
  it("sanitizes the exact observed junk string to an empty string", () => {
    expect(sanitizeModelText("</antmlःparameter>\n")).toBe("");
  });

  it("leaves real Hinglish/Devanagari content completely unchanged", () => {
    expect(sanitizeModelText("baaki 500 udhaar")).toBe("baaki 500 udhaar");
    expect(sanitizeModelText("सुरेश भाई")).toBe("सुरेश भाई");
  });

  it("strips a generic HTML/XML-ish tag", () => {
    expect(sanitizeModelText("hello <foo> world")).toBe("hello world");
    expect(sanitizeModelText("</bar>")).toBe("");
  });

  it("strips a tag whose name contains non-ASCII characters", () => {
    expect(sanitizeModelText("</antmlःparameter>")).toBe("");
  });

  it("collapses whitespace left behind after stripping a tag", () => {
    expect(sanitizeModelText("  baaki   500   udhaar  ")).toBe("baaki 500 udhaar");
  });

  it("treats null/undefined/empty as an empty string", () => {
    expect(sanitizeModelText(undefined)).toBe("");
    expect(sanitizeModelText(null)).toBe("");
    expect(sanitizeModelText("")).toBe("");
  });
});
