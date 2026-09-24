import { describe, it, expect } from "vitest";
import {
  amountToWords,
  confirmationText,
  entryText,
  balanceText,
  clarifyingQuestion,
  pickQuestionField,
  parseAmountAnswer,
  parsePartyAnswer,
  cleanPartyTranscript,
} from "./readback";

// ---------------------------------------------------------------------------
// amountToWords — Hindi: every 1-99 rupee word, individually.
// ---------------------------------------------------------------------------

const HI_1_99: readonly [number, string][] = [
  [1, "एक"],
  [2, "दो"],
  [3, "तीन"],
  [4, "चार"],
  [5, "पाँच"],
  [6, "छह"],
  [7, "सात"],
  [8, "आठ"],
  [9, "नौ"],
  [10, "दस"],
  [11, "ग्यारह"],
  [12, "बारह"],
  [13, "तेरह"],
  [14, "चौदह"],
  [15, "पंद्रह"],
  [16, "सोलह"],
  [17, "सत्रह"],
  [18, "अठारह"],
  [19, "उन्नीस"],
  [20, "बीस"],
  [21, "इक्कीस"],
  [22, "बाईस"],
  [23, "तेईस"],
  [24, "चौबीस"],
  [25, "पच्चीस"],
  [26, "छब्बीस"],
  [27, "सत्ताईस"],
  [28, "अट्ठाईस"],
  [29, "उनतीस"],
  [30, "तीस"],
  [31, "इकतीस"],
  [32, "बत्तीस"],
  [33, "तैंतीस"],
  [34, "चौंतीस"],
  [35, "पैंतीस"],
  [36, "छत्तीस"],
  [37, "सैंतीस"],
  [38, "अड़तीस"],
  [39, "उनतालीस"],
  [40, "चालीस"],
  [41, "इकतालीस"],
  [42, "बयालीस"],
  [43, "तैंतालीस"],
  [44, "चवालीस"],
  [45, "पैंतालीस"],
  [46, "छियालीस"],
  [47, "सैंतालीस"],
  [48, "अड़तालीस"],
  [49, "उनचास"],
  [50, "पचास"],
  [51, "इक्यावन"],
  [52, "बावन"],
  [53, "तिरपन"],
  [54, "चौवन"],
  [55, "पचपन"],
  [56, "छप्पन"],
  [57, "सत्तावन"],
  [58, "अट्ठावन"],
  [59, "उनसठ"],
  [60, "साठ"],
  [61, "इकसठ"],
  [62, "बासठ"],
  [63, "तिरसठ"],
  [64, "चौंसठ"],
  [65, "पैंसठ"],
  [66, "छियासठ"],
  [67, "सड़सठ"],
  [68, "अड़सठ"],
  [69, "उनहत्तर"],
  [70, "सत्तर"],
  [71, "इकहत्तर"],
  [72, "बहत्तर"],
  [73, "तिहत्तर"],
  [74, "चौहत्तर"],
  [75, "पचहत्तर"],
  [76, "छिहत्तर"],
  [77, "सतहत्तर"],
  [78, "अठहत्तर"],
  [79, "उन्यासी"],
  [80, "अस्सी"],
  [81, "इक्यासी"],
  [82, "बयासी"],
  [83, "तिरासी"],
  [84, "चौरासी"],
  [85, "पचासी"],
  [86, "छियासी"],
  [87, "सत्तासी"],
  [88, "अट्ठासी"],
  [89, "नवासी"],
  [90, "नब्बे"],
  [91, "इक्यानवे"],
  [92, "बानवे"],
  [93, "तिरानवे"],
  [94, "चौरानवे"],
  [95, "पंचानवे"],
  [96, "छियानवे"],
  [97, "सत्तानवे"],
  [98, "अट्ठानवे"],
  [99, "निन्यानवे"],
];

describe("amountToWords (hi) — every 1-99 rupee word individually", () => {
  it.each(HI_1_99)("%i rupees -> %s + रुपया/रुपये", (n, word) => {
    const expectedCurrency = n === 1 ? "रुपया" : "रुपये";
    expect(amountToWords(n * 100, "hi")).toBe(`${word} ${expectedCurrency}`);
  });
});

describe("amountToWords (hi) — boundary and compound cases", () => {
  it("0 paise -> शून्य रुपये", () => {
    expect(amountToWords(0, "hi")).toBe("शून्य रुपये");
  });

  it("negative/NaN paise are treated as zero", () => {
    expect(amountToWords(-500, "hi")).toBe("शून्य रुपये");
    expect(amountToWords(Number.NaN, "hi")).toBe("शून्य रुपये");
  });

  it("100 paise (1 rupee) -> एक रुपया (singular)", () => {
    expect(amountToWords(100, "hi")).toBe("एक रुपया");
  });

  it("101 paise -> एक रुपया और एक पैसे", () => {
    expect(amountToWords(101, "hi")).toBe("एक रुपया और एक पैसे");
  });

  it("110 paise -> एक रुपया और दस पैसे", () => {
    expect(amountToWords(110, "hi")).toBe("एक रुपया और दस पैसे");
  });

  it("999 paise -> नौ रुपये और निन्यानवे पैसे", () => {
    expect(amountToWords(999, "hi")).toBe("नौ रुपये और निन्यानवे पैसे");
  });

  it("1000 paise -> दस रुपये", () => {
    expect(amountToWords(1000, "hi")).toBe("दस रुपये");
  });

  it("1001 paise -> दस रुपये और एक पैसे", () => {
    expect(amountToWords(1001, "hi")).toBe("दस रुपये और एक पैसे");
  });

  it("99999 paise -> नौ सौ निन्यानवे रुपये और निन्यानवे पैसे", () => {
    expect(amountToWords(99_999, "hi")).toBe("नौ सौ निन्यानवे रुपये और निन्यानवे पैसे");
  });

  it("100000 paise -> एक हज़ार रुपये", () => {
    expect(amountToWords(100_000, "hi")).toBe("एक हज़ार रुपये");
  });

  it("50000 paise -> पाँच सौ रुपये", () => {
    expect(amountToWords(50_000, "hi")).toBe("पाँच सौ रुपये");
  });

  it("250000 paise -> दो हज़ार पाँच सौ रुपये", () => {
    expect(amountToWords(250_000, "hi")).toBe("दो हज़ार पाँच सौ रुपये");
  });

  it("12550 paise -> एक सौ पच्चीस रुपये और पचास पैसे", () => {
    expect(amountToWords(12_550, "hi")).toBe("एक सौ पच्चीस रुपये और पचास पैसे");
  });

  it("15000000 paise -> एक लाख पचास हज़ार रुपये", () => {
    expect(amountToWords(15_000_000, "hi")).toBe("एक लाख पचास हज़ार रुपये");
  });

  it("1234567 paise -> बारह हज़ार तीन सौ पैंतालीस रुपये और सड़सठ पैसे", () => {
    expect(amountToWords(1_234_567, "hi")).toBe("बारह हज़ार तीन सौ पैंतालीस रुपये और सड़सठ पैसे");
  });

  it("1000000000 paise (1 crore) -> एक करोड़ रुपये", () => {
    expect(amountToWords(1_000_000_000, "hi")).toBe("एक करोड़ रुपये");
  });

  it("2,50,00,000 rupees (2.5 crore) -> दो करोड़ पचास लाख रुपये", () => {
    expect(amountToWords(2_500_000_000, "hi")).toBe("दो करोड़ पचास लाख रुपये");
  });

  it("paise-only amount (50 paise, 0 rupees) -> पचास पैसे, no रुपये mention", () => {
    expect(amountToWords(50, "hi")).toBe("पचास पैसे");
  });

  it("paise-only amount of 1 paisa -> एक पैसे", () => {
    expect(amountToWords(1, "hi")).toBe("एक पैसे");
  });

  it("paise-only amount of 99 paise -> निन्यानवे पैसे", () => {
    expect(amountToWords(99, "hi")).toBe("निन्यानवे पैसे");
  });
});

// ---------------------------------------------------------------------------
// amountToWords — English
// ---------------------------------------------------------------------------

describe("amountToWords (en) — spec examples", () => {
  it("0 paise -> zero rupees", () => {
    expect(amountToWords(0, "en")).toBe("zero rupees");
  });

  it("100 paise (1 rupee) -> one rupee (singular)", () => {
    expect(amountToWords(100, "en")).toBe("one rupee");
  });

  it("250000 paise -> two thousand five hundred rupees", () => {
    expect(amountToWords(250_000, "en")).toBe("two thousand five hundred rupees");
  });

  it("15000000 paise -> one lakh fifty thousand rupees", () => {
    expect(amountToWords(15_000_000, "en")).toBe("one lakh fifty thousand rupees");
  });

  it("12550 paise -> one hundred twenty-five rupees and fifty paise", () => {
    expect(amountToWords(12_550, "en")).toBe("one hundred twenty-five rupees and fifty paise");
  });
});

describe("amountToWords (en) — boundary and compound cases", () => {
  it("negative/NaN paise are treated as zero", () => {
    expect(amountToWords(-1, "en")).toBe("zero rupees");
    expect(amountToWords(Number.NaN, "en")).toBe("zero rupees");
  });

  it("101 paise -> one rupee and one paise", () => {
    expect(amountToWords(101, "en")).toBe("one rupee and one paise");
  });

  it("110 paise -> one rupee and ten paise", () => {
    expect(amountToWords(110, "en")).toBe("one rupee and ten paise");
  });

  it("999 paise -> nine rupees and ninety-nine paise", () => {
    expect(amountToWords(999, "en")).toBe("nine rupees and ninety-nine paise");
  });

  it("1000 paise -> ten rupees", () => {
    expect(amountToWords(1000, "en")).toBe("ten rupees");
  });

  it("1001 paise -> ten rupees and one paise", () => {
    expect(amountToWords(1001, "en")).toBe("ten rupees and one paise");
  });

  it("99999 paise -> nine hundred ninety-nine rupees and ninety-nine paise", () => {
    expect(amountToWords(99_999, "en")).toBe("nine hundred ninety-nine rupees and ninety-nine paise");
  });

  it("100000 paise -> one thousand rupees", () => {
    expect(amountToWords(100_000, "en")).toBe("one thousand rupees");
  });

  it("1234567 paise -> twelve thousand three hundred forty-five rupees and sixty-seven paise", () => {
    expect(amountToWords(1_234_567, "en")).toBe(
      "twelve thousand three hundred forty-five rupees and sixty-seven paise"
    );
  });

  it("1000000000 paise (1 crore) -> one crore rupees", () => {
    expect(amountToWords(1_000_000_000, "en")).toBe("one crore rupees");
  });

  it("2,50,00,000 rupees (2.5 crore) -> two crore fifty lakh rupees", () => {
    expect(amountToWords(2_500_000_000, "en")).toBe("two crore fifty lakh rupees");
  });

  it("paise-only amount (50 paise) -> fifty paise, no rupees mention", () => {
    expect(amountToWords(50, "en")).toBe("fifty paise");
  });

  it("paise-only amount of 1 paisa -> one paise", () => {
    expect(amountToWords(1, "en")).toBe("one paise");
  });
});

describe("amountToWords (en) — tens boundary spot-check (English tens are regular)", () => {
  const cases: readonly [number, string][] = [
    [1, "one rupee"],
    [2, "two rupees"],
    [9, "nine rupees"],
    [10, "ten rupees"],
    [11, "eleven rupees"],
    [19, "nineteen rupees"],
    [20, "twenty rupees"],
    [21, "twenty-one rupees"],
    [29, "twenty-nine rupees"],
    [30, "thirty rupees"],
    [40, "forty rupees"],
    [45, "forty-five rupees"],
    [50, "fifty rupees"],
    [59, "fifty-nine rupees"],
    [60, "sixty rupees"],
    [70, "seventy rupees"],
    [80, "eighty rupees"],
    [90, "ninety rupees"],
    [99, "ninety-nine rupees"],
  ];

  it.each(cases)("%i rupees -> %s", (n, expected) => {
    expect(amountToWords(n * 100, "en")).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// confirmationText
// ---------------------------------------------------------------------------

describe("confirmationText", () => {
  it("hi paid", () => {
    expect(confirmationText({ party: "Ramesh", amountPaise: 50_000, direction: "paid" }, "hi")).toBe(
      "Ramesh को पाँच सौ रुपये दिए। सही है?"
    );
  });

  it("hi received", () => {
    expect(
      confirmationText({ party: "Suresh", amountPaise: 300_000, direction: "received" }, "hi")
    ).toBe("Suresh से तीन हज़ार रुपये आए। सही है?");
  });

  it("en paid", () => {
    expect(confirmationText({ party: "Ramesh", amountPaise: 50_000, direction: "paid" }, "en")).toBe(
      "Paid five hundred rupees to Ramesh. Is that right?"
    );
  });

  it("en received", () => {
    expect(
      confirmationText({ party: "Suresh", amountPaise: 300_000, direction: "received" }, "en")
    ).toBe("Received three thousand rupees from Suresh. Is that right?");
  });

  it("hi received, new party — announces a new account instead of asking for the name", () => {
    expect(
      confirmationText(
        { party: "Suresh", amountPaise: 300_000, direction: "received", newParty: true },
        "hi"
      )
    ).toBe("Suresh से तीन हज़ार रुपये आए। Suresh का नया खाता बनेगा। सही है?");
  });

  it("en received, new party — announces a new account instead of asking for the name", () => {
    expect(
      confirmationText(
        { party: "Suresh", amountPaise: 300_000, direction: "received", newParty: true },
        "en"
      )
    ).toBe("Received three thousand rupees from Suresh. This will open a new account for Suresh. Is that right?");
  });

  it("hi paid, newParty explicitly false plays exactly the original sentence", () => {
    expect(
      confirmationText({ party: "Ramesh", amountPaise: 50_000, direction: "paid", newParty: false }, "hi")
    ).toBe("Ramesh को पाँच सौ रुपये दिए। सही है?");
  });
});

// ---------------------------------------------------------------------------
// entryText
// ---------------------------------------------------------------------------

describe("entryText", () => {
  const now = new Date(2026, 6, 10, 12, 0, 0); // 10 July 2026, noon
  const today = new Date(2026, 6, 10, 9, 15, 0).toISOString();
  const yesterday = new Date(2026, 6, 9, 20, 0, 0).toISOString();
  const older = new Date(2026, 6, 3, 15, 30, 0).toISOString();

  it("hi, today, no note", () => {
    const text = entryText(
      { party: "Ramesh", amountPaise: 50_000, direction: "paid", createdAt: today },
      "hi",
      now
    );
    expect(text).toBe("आज, Ramesh को पाँच सौ रुपये दिए।");
  });

  it("hi, yesterday, with note", () => {
    const text = entryText(
      {
        party: "Suresh",
        amountPaise: 300_000,
        direction: "received",
        note: "चावल बेचा",
        createdAt: yesterday,
      },
      "hi",
      now
    );
    expect(text).toBe("कल, Suresh से तीन हज़ार रुपये आए। नोट: चावल बेचा।");
  });

  it("hi, an older date, uses '<day> <month>' with no year", () => {
    const text = entryText(
      { party: "Mohan", amountPaise: 100_00, direction: "paid", createdAt: older },
      "hi",
      now
    );
    expect(text).toBe("3 जुलाई, Mohan को एक सौ रुपये दिए।");
  });

  it("en, today, no note", () => {
    const text = entryText(
      { party: "Ramesh", amountPaise: 50_000, direction: "paid", createdAt: today },
      "en",
      now
    );
    expect(text).toBe("Today, paid five hundred rupees to Ramesh.");
  });

  it("en, yesterday, with note", () => {
    const text = entryText(
      {
        party: "Suresh",
        amountPaise: 300_000,
        direction: "received",
        note: "sold rice",
        createdAt: yesterday,
      },
      "en",
      now
    );
    expect(text).toBe("Yesterday, received three thousand rupees from Suresh. Note: sold rice.");
  });

  it("en, an older date, uses '<day> <month>' with no year", () => {
    const text = entryText(
      { party: "Mohan", amountPaise: 100_00, direction: "paid", createdAt: older },
      "en",
      now
    );
    expect(text).toBe("3 July, paid one hundred rupees to Mohan.");
  });

  it("blank/whitespace-only note is treated as no note", () => {
    const text = entryText(
      { party: "Ramesh", amountPaise: 100, direction: "paid", note: "   ", createdAt: today },
      "en",
      now
    );
    expect(text).toBe("Today, paid one rupee to Ramesh.");
  });
});

// ---------------------------------------------------------------------------
// balanceText
// ---------------------------------------------------------------------------

describe("balanceText", () => {
  it("hi — they owe you (negative balance)", () => {
    expect(balanceText("Ramesh", -50_000, "hi")).toBe("Ramesh से पाँच सौ रुपये लेने हैं।");
  });

  it("hi — you owe them (positive balance)", () => {
    expect(balanceText("Ramesh", 50_000, "hi")).toBe("Ramesh को पाँच सौ रुपये देने हैं।");
  });

  it("hi — settled (zero balance)", () => {
    expect(balanceText("Ramesh", 0, "hi")).toBe("Ramesh का हिसाब बराबर है।");
  });

  it("en — they owe you (negative balance)", () => {
    expect(balanceText("Ramesh", -50_000, "en")).toBe("Ramesh owes you five hundred rupees.");
  });

  it("en — you owe them (positive balance)", () => {
    expect(balanceText("Ramesh", 50_000, "en")).toBe("You owe Ramesh five hundred rupees.");
  });

  it("en — settled (zero balance)", () => {
    expect(balanceText("Ramesh", 0, "en")).toBe("Ramesh's account is settled.");
  });
});

// ---------------------------------------------------------------------------
// clarifyingQuestion
// ---------------------------------------------------------------------------

describe("clarifyingQuestion", () => {
  it("hi party", () => {
    expect(clarifyingQuestion("party", "hi")).toBe("किसका हिसाब है? नाम बोलिए।");
  });
  it("hi amount", () => {
    expect(clarifyingQuestion("amount", "hi")).toBe("कितने रुपये? रकम बोलिए।");
  });
  it("hi direction", () => {
    expect(clarifyingQuestion("direction", "hi")).toBe("पैसे आए या दिए? हरा या लाल बटन दबाइए।");
  });
  it("en party", () => {
    expect(clarifyingQuestion("party", "en")).toBe("Whose account is this? Say the name.");
  });
  it("en amount", () => {
    expect(clarifyingQuestion("amount", "en")).toBe("How many rupees? Say the amount.");
  });
  it("en direction", () => {
    expect(clarifyingQuestion("direction", "en")).toBe("Did the money come in or go out? Press the green or red button.");
  });
});

// ---------------------------------------------------------------------------
// pickQuestionField
// ---------------------------------------------------------------------------

describe("pickQuestionField", () => {
  const noFlags = { party: false, amount: false };

  it("returns null when the party is present and the amount is fine", () => {
    expect(pickQuestionField({ party: "Ramesh", amountPaise: 500 }, noFlags)).toBeNull();
  });

  it("returns 'party' when the party text is empty", () => {
    expect(pickQuestionField({ party: "", amountPaise: 500 }, noFlags)).toBe("party");
  });

  it("returns 'party' for a whitespace-only party text", () => {
    expect(pickQuestionField({ party: "   ", amountPaise: 500 }, noFlags)).toBe("party");
  });

  it("does NOT ask for the party when it's present but unmatched (a brand-new contact)", () => {
    // This is the bug being fixed: a new customer's name that the
    // shopkeeper just said must never trigger a re-ask — confirmationText's
    // newParty announcement handles this case instead.
    expect(
      pickQuestionField({ party: "Deepak", amountPaise: 500 }, { party: true, amount: false })
    ).toBeNull();
  });

  it("returns 'amount' when computeFieldReviewFlags flagged the amount", () => {
    expect(
      pickQuestionField({ party: "Ramesh", amountPaise: 500 }, { party: false, amount: true })
    ).toBe("amount");
  });

  it("returns 'amount' when amountPaise is zero, even if not flagged", () => {
    expect(pickQuestionField({ party: "Ramesh", amountPaise: 0 }, noFlags)).toBe("amount");
  });

  it("returns 'amount' when amountPaise is negative, even if not flagged", () => {
    expect(pickQuestionField({ party: "Ramesh", amountPaise: -500 }, noFlags)).toBe("amount");
  });

  it("prioritizes 'party' over 'amount' when both need attention", () => {
    expect(
      pickQuestionField({ party: "", amountPaise: 0 }, { party: true, amount: true })
    ).toBe("party");
  });
});

// ---------------------------------------------------------------------------
// parseAmountAnswer
// ---------------------------------------------------------------------------

describe("parseAmountAnswer", () => {
  it("parses a Latin-transliteration spoken amount", () => {
    expect(parseAmountAnswer("paanch sau")).toBe(50_000);
  });

  it("parses a Devanagari spoken amount", () => {
    expect(parseAmountAnswer("पांच सौ")).toBe(50_000);
  });

  it("parses a bare numeral in a sentence", () => {
    expect(parseAmountAnswer("2500 rupaye")).toBe(250_000);
  });

  it("parses the largest amount when several are mentioned", () => {
    expect(parseAmountAnswer("2500 diye baaki 500 udhaar")).toBe(250_000);
  });

  it("returns null when nothing numeric was heard", () => {
    expect(parseAmountAnswer("umm haan theek hai")).toBeNull();
  });

  it("returns null for an empty transcript", () => {
    expect(parseAmountAnswer("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parsePartyAnswer
// ---------------------------------------------------------------------------

describe("parsePartyAnswer", () => {
  const existing = ["Ramesh", "Suresh"];

  it("matches an existing name exactly", () => {
    expect(parsePartyAnswer("Ramesh", existing)).toBe("Ramesh");
  });

  it("matches an existing name case-insensitively", () => {
    expect(parsePartyAnswer("ramesh", existing)).toBe("Ramesh");
  });

  it("strips trailing punctuation before matching", () => {
    expect(parsePartyAnswer("Ramesh.", existing)).toBe("Ramesh");
    expect(parsePartyAnswer("रमेश।", existing)).toBe("रमेश");
  });

  it("strips common Latin filler words around the name", () => {
    expect(parsePartyAnswer("Ramesh ka naam hai", existing)).toBe("Ramesh");
    expect(parsePartyAnswer("naam Suresh hai", existing)).toBe("Suresh");
  });

  it("strips common Devanagari filler words around the name", () => {
    expect(parsePartyAnswer("रमेश है", ["रमेश"])).toBe("रमेश");
  });

  it("falls back to the cleaned transcript as a brand-new name", () => {
    expect(parsePartyAnswer("Deepak", existing)).toBe("Deepak");
    expect(parsePartyAnswer("Deepak hai", existing)).toBe("Deepak");
  });

  it("returns null when only filler words were heard", () => {
    expect(parsePartyAnswer("hai naam", existing)).toBeNull();
  });

  it("returns null for an empty or whitespace-only transcript", () => {
    expect(parsePartyAnswer("", existing)).toBeNull();
    expect(parsePartyAnswer("   ", existing)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cleanPartyTranscript — exported so the voice page can send this cleaned
// text straight to /api/match-party (see parsePartyAnswer above for the
// version that also fuzzy-matches locally).
// ---------------------------------------------------------------------------

describe("cleanPartyTranscript", () => {
  it("trims and strips trailing punctuation", () => {
    expect(cleanPartyTranscript("  Ramesh.  ")).toBe("Ramesh");
    expect(cleanPartyTranscript("रमेश।")).toBe("रमेश");
  });

  it("strips common Latin filler words around the name", () => {
    expect(cleanPartyTranscript("Ramesh ka naam hai")).toBe("Ramesh");
    expect(cleanPartyTranscript("naam Suresh hai")).toBe("Suresh");
  });

  it("strips common Devanagari filler words around the name", () => {
    expect(cleanPartyTranscript("रमेश है")).toBe("रमेश");
  });

  it("does NOT match against any existing-party list — it only cleans", () => {
    expect(cleanPartyTranscript("Deepak hai")).toBe("Deepak");
  });

  it("returns an empty string when only filler words were heard", () => {
    expect(cleanPartyTranscript("hai naam")).toBe("");
  });

  it("returns an empty string for an empty or whitespace-only transcript", () => {
    expect(cleanPartyTranscript("")).toBe("");
    expect(cleanPartyTranscript("   ")).toBe("");
  });
});
