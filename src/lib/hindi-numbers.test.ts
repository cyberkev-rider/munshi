import { describe, it, expect } from "vitest";
import { findAllAmounts, parseSpokenAmount, parseLargestSpokenAmount } from "./hindi-numbers";

describe("parseSpokenAmount — basic digits and tens", () => {
  it("parses a bare Arabic numeral", () => {
    expect(parseSpokenAmount("2500 rupaye diye")?.rupees).toBe(2500);
  });

  it("parses a single Latin digit word", () => {
    expect(parseSpokenAmount("paanch rupaye")?.rupees).toBe(5);
  });

  it("parses a single Devanagari digit word", () => {
    expect(parseSpokenAmount("पांच रुपये")?.rupees).toBe(5);
  });

  it("parses an irregular teen (gyarah = 11)", () => {
    expect(parseSpokenAmount("gyarah rupaye")?.rupees).toBe(11);
  });

  it("parses an irregular tens value (pachpan = 55)", () => {
    expect(parseSpokenAmount("pachpan rupaye")?.rupees).toBe(55);
  });

  it("parses assi (80)", () => {
    expect(parseSpokenAmount("assi rupaye")?.rupees).toBe(80);
  });

  it("parses ninety-nine (ninyaanve)", () => {
    expect(parseSpokenAmount("ninyaanve rupaye")?.rupees).toBe(99);
  });
});

describe("parseSpokenAmount — scale words (sau/hazaar/lakh/crore)", () => {
  it("paanch sau = 500", () => {
    expect(parseSpokenAmount("paanch sau rupaye diye")?.rupees).toBe(500);
  });

  it("teen hazaar = 3000", () => {
    expect(parseSpokenAmount("Suresh se teen hazaar aaye")?.rupees).toBe(3000);
  });

  it("do lakh = 200000", () => {
    expect(parseSpokenAmount("do lakh rupaye")?.rupees).toBe(200_000);
  });

  it("ek crore = 10000000", () => {
    expect(parseSpokenAmount("ek crore")?.rupees).toBe(10_000_000);
  });

  it("bare 'hazaar' with no leading unit implies 1x", () => {
    expect(parseSpokenAmount("hazaar rupaye")?.rupees).toBe(1000);
  });

  it("bare 'sau' with no leading unit implies 1x", () => {
    expect(parseSpokenAmount("sau rupaye")?.rupees).toBe(100);
  });

  it("Devanagari scale word (सौ)", () => {
    expect(parseSpokenAmount("पांच सौ रुपये")?.rupees).toBe(500);
  });

  it("Devanagari hazaar (हज़ार)", () => {
    expect(parseSpokenAmount("तीन हज़ार आए")?.rupees).toBe(3000);
  });

  it("Devanagari lakh (लाख)", () => {
    expect(parseSpokenAmount("दो लाख")?.rupees).toBe(200_000);
  });
});

describe("parseSpokenAmount — compound scale phrases", () => {
  it("do hazaar paanch sau = 2500", () => {
    expect(parseSpokenAmount("do hazaar paanch sau diye")?.rupees).toBe(2500);
  });

  it("Mohan ko 2 thousand 5 hundred diye scenario (digit-word mix)", () => {
    expect(parseSpokenAmount("2 thousand 5 hundred diye")?.rupees).toBe(2500);
  });

  it("ek lakh das hazaar = 110000", () => {
    expect(parseSpokenAmount("ek lakh das hazaar")?.rupees).toBe(110_000);
  });

  it("teen sau pachaas = 350", () => {
    expect(parseSpokenAmount("teen sau pachaas")?.rupees).toBe(350);
  });

  it("do hazaar paanch sau pachaas = 2550 (scale + scale + bare tens)", () => {
    expect(parseSpokenAmount("do hazaar paanch sau pachaas")?.rupees).toBe(2550);
  });
});

describe("parseSpokenAmount — multiplier idioms", () => {
  it("dhai hazaar = 2500", () => {
    expect(parseSpokenAmount("dhai hazaar rupaye")?.rupees).toBe(2500);
  });

  it("dhai sau = 250", () => {
    expect(parseSpokenAmount("dhai sau")?.rupees).toBe(250);
  });

  it("sava sau = 125", () => {
    expect(parseSpokenAmount("sava sau rupaye")?.rupees).toBe(125);
  });

  it("paune do sau = 175", () => {
    expect(parseSpokenAmount("paune do sau")?.rupees).toBe(175);
  });

  it("dedh lakh (rupees) = 150000", () => {
    expect(parseSpokenAmount("dedh lakh rupaye")?.rupees).toBe(150_000);
  });

  it("dedh sau = 150", () => {
    expect(parseSpokenAmount("dedh sau")?.rupees).toBe(150);
  });

  it("paune sau (bare, implicit unit=1) = 75", () => {
    expect(parseSpokenAmount("paune sau")?.rupees).toBe(75);
  });

  it("sava hazaar = 1250", () => {
    expect(parseSpokenAmount("sava hazaar")?.rupees).toBe(1250);
  });

  it("paune teen sau = 275", () => {
    expect(parseSpokenAmount("paune teen sau")?.rupees).toBe(275);
  });

  it("Devanagari dedh (डेढ़)", () => {
    expect(parseSpokenAmount("डेढ़ सौ")?.rupees).toBe(150);
  });

  it("Devanagari dhai (ढाई)", () => {
    expect(parseSpokenAmount("ढाई हज़ार")?.rupees).toBe(2500);
  });

  it("Devanagari sava (सवा)", () => {
    expect(parseSpokenAmount("सवा सौ")?.rupees).toBe(125);
  });

  it("Devanagari paune (पौने)", () => {
    expect(parseSpokenAmount("पौने दो सौ")?.rupees).toBe(175);
  });

  it("alternate spelling derh = dedh", () => {
    expect(parseSpokenAmount("derh sau")?.rupees).toBe(150);
  });

  it("alternate spelling pone = paune", () => {
    expect(parseSpokenAmount("pone do sau")?.rupees).toBe(175);
  });
});

describe("parseSpokenAmount — realistic shopkeeper sentences from the spec", () => {
  it("Ramesh ko paanch sau rupaye diye -> 500", () => {
    expect(parseSpokenAmount("Ramesh ko paanch sau rupaye diye")?.rupees).toBe(500);
  });

  it("Suresh se 3 hazaar aaye -> 3000", () => {
    expect(parseSpokenAmount("Suresh se 3 hazaar aaye")?.rupees).toBe(3000);
  });

  it("Mohan ko 2 thousand 5 hundred diye, baaki 500 udhaar -> first amount 2500", () => {
    // The primary transaction amount is the first (and largest) figure;
    // "baaki 500 udhaar" is a remainder note, not the transaction amount.
    expect(parseSpokenAmount("Mohan ko 2 thousand 5 hundred diye, baaki 500 udhaar")?.rupees).toBe(
      2500
    );
  });

  it("dhai hazaar diye Ramesh ko -> 2500", () => {
    expect(parseSpokenAmount("dhai hazaar diye Ramesh ko")?.rupees).toBe(2500);
  });

  it("sava sau ka udhaar hai -> 125", () => {
    expect(parseSpokenAmount("sava sau ka udhaar hai")?.rupees).toBe(125);
  });

  it("paune do sau ka hisaab -> 175", () => {
    expect(parseSpokenAmount("paune do sau ka hisaab")?.rupees).toBe(175);
  });

  it("dedh lakh rupaye ka order -> 150000", () => {
    expect(parseSpokenAmount("dedh lakh rupaye ka order")?.rupees).toBe(150_000);
  });
});

describe("findAllAmounts", () => {
  it("finds multiple distinct amounts in one transcript", () => {
    const all = findAllAmounts("2 thousand 5 hundred diye, baaki 500 udhaar");
    expect(all.map((a) => a.rupees)).toEqual([2500, 500]);
  });

  it("returns an empty array when no number words are present", () => {
    expect(findAllAmounts("Ramesh ko paise diye")).toEqual([]);
  });

  it("returns an empty array for an empty string", () => {
    expect(findAllAmounts("")).toEqual([]);
  });

  it("handles a transcript that is only whitespace", () => {
    expect(findAllAmounts("   ")).toEqual([]);
  });
});

describe("parseLargestSpokenAmount", () => {
  it("picks the larger of two amounts", () => {
    expect(parseLargestSpokenAmount("baaki 500 udhaar, 2500 diye")?.rupees).toBe(2500);
  });

  it("returns undefined when nothing parses", () => {
    expect(parseLargestSpokenAmount("kuch nahi")).toBeUndefined();
  });

  it("returns the only amount when there is exactly one", () => {
    expect(parseLargestSpokenAmount("teen sau diye")?.rupees).toBe(300);
  });
});

describe("parseSpokenAmount — case insensitivity and punctuation", () => {
  it("is case-insensitive", () => {
    expect(parseSpokenAmount("PAANCH SAU rupaye")?.rupees).toBe(500);
  });

  it("ignores surrounding punctuation", () => {
    expect(parseSpokenAmount("Ramesh ko, paanch-sau rupaye, diye!")?.rupees).toBe(500);
  });

  it("ignores currency symbols", () => {
    expect(parseSpokenAmount("₹500 diye")?.rupees).toBe(500);
  });
});

describe("parseSpokenAmount — no false positives", () => {
  it("does not parse a phone-number-like sequence as one huge amount incorrectly merged", () => {
    // Not a number phrase claim beyond what's mechanically true — a bare
    // multi-digit numeral is still just parsed as that numeral.
    expect(parseSpokenAmount("9876543210")?.rupees).toBe(9876543210);
  });

  it("returns undefined for text with no numbers at all", () => {
    expect(parseSpokenAmount("namaste kaise ho")).toBeUndefined();
  });

  it("does not treat an idiom word with no following scale as a match", () => {
    // "dedh" alone (no scale word after it) has no idiomatic meaning.
    expect(parseSpokenAmount("dedh accha hai")).toBeUndefined();
  });
});
