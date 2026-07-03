/**
 * Deterministic parser for spoken Indian-English/Hindi number words, as they
 * show up in speech-to-text transcripts of shopkeepers dictating amounts.
 *
 * Pure module: no I/O, no network, no LLM. This exists specifically so the
 * amount extracted by the LLM (extract.ts / /api/extract) can be
 * cross-checked against a mechanical parse of the same transcript — see
 * crossCheckAmount in src/lib/extract-helpers.ts.
 *
 * Scope: this module returns RUPEES (not paise) as a plain number, since the
 * amounts it parses are inherently whole-rupee (nobody says "paanch sau
 * pachaas paise" in this domain). Callers multiply by 100 for paise.
 *
 * Supported vocabulary (Latin transliteration AND Devanagari script):
 *   - Digits 0-9 (both scripts' number words, e.g. "teen"/"तीन" = 3)
 *   - Tens/teens up to 99 via the standard Hindi irregular number words
 *   - Scale words: sau (100), hazaar/hazar (1,000), lakh (100,000),
 *     crore (10,000,000)
 *   - Multiplier idioms: dedh (1.5x), dhai (2.5x), sava (1.25x), paune (0.75x
 *     of the NEXT scale unit, e.g. "paune do sau" = 0.75 * 2 * 100 = 150...
 *     but conventionally "paune do sau" means 175, i.e. (2*100) - 25 = one
 *     quarter-unit short of 200. See PAUNE handling below.)
 *   - Plain English/digit-word mixes ("2 hazaar 5 sau", "3 thousand")
 *   - Bare Arabic numerals embedded in the transcript ("2500 rupaye")
 *
 * Not in scope: currency-word stripping beyond what's needed to isolate the
 * number phrase, grammar correction, or multi-number-per-utterance
 * disambiguation (the caller decides which parsed number is "the amount").
 */

/** Result of attempting to parse a spoken amount out of a transcript. */
export interface ParsedAmount {
  /** The parsed value in whole rupees. */
  rupees: number;
  /** The substring of the (normalized) transcript that was consumed to
   * produce this value, for debugging/logging. */
  matchedText: string;
}

// ---------------------------------------------------------------------------
// Vocabulary tables
// ---------------------------------------------------------------------------

/** Basic digit words 0-9, Latin transliteration. Zero is rarely spoken alone
 * in this domain but included for completeness. */
const DIGIT_WORDS_LATIN: Record<string, number> = {
  zero: 0,
  shunya: 0,
  ek: 1,
  do: 2,
  teen: 3,
  tin: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  che: 6,
  chhe: 6,
  cheh: 6,
  saat: 7,
  aath: 8,
  ath: 8,
  nau: 9,
  no: 9,
};

/** Devanagari digit words 0-9. */
const DIGIT_WORDS_DEVANAGARI: Record<string, number> = {
  शून्य: 0,
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  छे: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
};

/**
 * Full irregular 0-99 Hindi number words (Latin transliteration). Hindi's
 * teens/tens are famously irregular (unlike English's tens+ones pattern), so
 * this is an exhaustive lookup rather than a computed one. Multiple common
 * transliteration spellings map to the same value.
 */
const TENS_WORDS_LATIN: Record<string, number> = {
  ek: 1,
  do: 2,
  teen: 3,
  tin: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  che: 6,
  chhe: 6,
  cheh: 6,
  saat: 7,
  aath: 8,
  ath: 8,
  nau: 9,
  das: 10,
  dus: 10,
  gyarah: 11,
  gyara: 11,
  barah: 12,
  bara: 12,
  terah: 13,
  tera: 13,
  chaudah: 14,
  chauda: 14,
  pandrah: 15,
  pandra: 15,
  solah: 16,
  sola: 16,
  satrah: 17,
  satra: 17,
  atharah: 18,
  athara: 18,
  unnis: 19,
  unees: 19,
  bees: 20,
  bis: 20,
  ikkis: 21,
  ikkees: 21,
  baees: 22,
  bais: 22,
  teis: 23,
  teees: 23,
  chaubis: 24,
  chaubees: 24,
  pachees: 25,
  pachis: 25,
  chhabbis: 26,
  chhabis: 26,
  sattaees: 27,
  sattais: 27,
  athaees: 28,
  athais: 28,
  untis: 29,
  untees: 29,
  tees: 30,
  tis: 30,
  ikattis: 31,
  battis: 32,
  battees: 32,
  taintis: 33,
  chauntis: 34,
  paintis: 35,
  chhattis: 36,
  saintis: 37,
  adtis: 38,
  untalis: 39,
  chalis: 40,
  chaalis: 40,
  iktalis: 41,
  bayalis: 42,
  taintalis: 43,
  chauwalis: 44,
  paintalis: 45,
  chhiyalis: 46,
  saintalis: 47,
  adtalis: 48,
  uncchas: 49,
  unchaas: 49,
  pachas: 50,
  pachaas: 50,
  ikyawan: 51,
  bawan: 52,
  tirpan: 53,
  chauwan: 54,
  pachpan: 55,
  chhappan: 56,
  sattawan: 57,
  atthawan: 58,
  unsath: 59,
  saath: 60,
  saat_60: 60, // never emitted; placeholder to avoid accidental collision comments
  iksath: 61,
  baasath: 62,
  tirsath: 63,
  chausath: 64,
  painsath: 65,
  chhiyasath: 66,
  sadsath: 67,
  atsath: 68,
  unhattar: 69,
  sattar: 70,
  ikhattar: 71,
  bahattar: 72,
  tihattar: 73,
  chauhattar: 74,
  pachhattar: 75,
  chhihattar: 76,
  sathattar: 77,
  athhattar: 78,
  unyaasi: 79,
  assi: 80,
  ikyaasi: 81,
  bayaasi: 82,
  tiraasi: 83,
  chauraasi: 84,
  pachaasi: 85,
  chhiyaasi: 86,
  sataasi: 87,
  athaasi: 88,
  navaasi: 89,
  nabbe: 90,
  ikyaanve: 91,
  bayaanve: 92,
  tiraanve: 93,
  chauraanve: 94,
  pachaanve: 95,
  chhiyaanve: 96,
  sataanve: 97,
  athaanve: 98,
  ninyaanve: 99,
};
// Remove the placeholder key — it exists only so the object literal above
// reads cleanly; it must never be matched.
delete (TENS_WORDS_LATIN as Record<string, number>).saat_60;

/** Scale words: word -> multiplier value in rupees. */
const SCALE_WORDS_LATIN: Record<string, number> = {
  sau: 100,
  hazaar: 1000,
  hazar: 1000,
  thousand: 1000,
  lakh: 100_000,
  lac: 100_000,
  crore: 10_000_000,
  karod: 10_000_000,
};

const SCALE_WORDS_DEVANAGARI: Record<string, number> = {
  सौ: 100,
  हज़ार: 1000,
  हजार: 1000,
  लाख: 100_000,
  करोड़: 10_000_000,
  करोड: 10_000_000,
};

/** English scale/digit words, so mixed transcripts ("3 thousand", "2
 * hundred") also parse. */
const ENGLISH_SCALE_WORDS: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
  lakh: 100_000,
  lac: 100_000,
  crore: 10_000_000,
  million: 1_000_000,
};

const ENGLISH_DIGIT_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** Devanagari 20-99 multiples-of-ten words (rare in transcripts, but the
 * script variant must be handled since Sarvam may return Devanagari). We
 * reuse the same irregular set as Latin by normalizing scripts first (see
 * `transliterateDevanagariDigitsToLatinKeys` — not implemented as a full
 * transliterator; instead we keep a parallel Devanagari tens table for the
 * common cases actually seen in shopkeeper speech). */
const TENS_WORDS_DEVANAGARI: Record<string, number> = {
  दस: 10,
  ग्यारह: 11,
  बारह: 12,
  तेरह: 13,
  चौदह: 14,
  पंद्रह: 15,
  सोलह: 16,
  सत्रह: 17,
  अठारह: 18,
  उन्नीस: 19,
  बीस: 20,
  तीस: 30,
  चालीस: 40,
  पचास: 50,
  साठ: 60,
  सत्तर: 70,
  अस्सी: 80,
  नब्बे: 90,
  पच्चीस: 25,
  पैंतीस: 35,
  पैंतालीस: 45,
  पचपन: 55,
  पचहत्तर: 75,
};

/** Multiplier idiom words: dedh (1.5x), dhai (2.5x), sava (1.25x quarter-up),
 * paune (0.75x quarter-down of the NEXT integer scale unit). These always
 * precede a scale word (sau/hazaar/lakh/crore) or, for dedh/dhai/sava alone,
 * imply "x.5 hundred"-ish shortcuts are NOT idiomatic in Hindi — dedh/dhai/
 * sava/paune are only ever used immediately before a scale word (dedh sau,
 * dhai hazaar, sava sau, paune do sau) or, for dedh/dhai, before "lakh"/
 * "crore" to mean "one and a half [unit]" / "two and a half [unit]". */
type MultiplierIdiom = "dedh" | "dhai" | "sava" | "paune";

const MULTIPLIER_IDIOM_WORDS: Record<string, MultiplierIdiom> = {
  dedh: "dedh",
  derh: "dedh",
  dhai: "dhai",
  dhaai: "dhai",
  sava: "sava",
  savaa: "sava",
  paune: "paune",
  pone: "paune",
  डेढ़: "dedh",
  ढाई: "dhai",
  सवा: "sava",
  पौने: "paune",
};

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/** Splits a transcript into lowercase word tokens, keeping Devanagari
 * characters intact and stripping punctuation. Digits (Arabic numerals) are
 * kept as their own tokens.
 *
 * IMPORTANT: Devanagari vowel signs (matras like ो, ा, ी) and the nukta
 * (़, used in हज़ार/ढाई-adjacent spellings) are Unicode combining marks
 * (\p{M}), NOT letters (\p{L}) — dropping them would mutilate words (दो ->
 * द, लाख -> लख). \p{M} must be kept alongside \p{L} and \p{N}.
 */
function tokenize(transcript: string): string[] {
  const normalized = transcript
    .toLowerCase()
    // Keep word characters (Latin + Devanagari, including combining marks),
    // digits, and whitespace; drop everything else (punctuation, currency
    // symbols).
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .trim();
  if (normalized === "") return [];
  return normalized.split(/\s+/);
}

/** True if the token is purely Arabic numerals ("2500"). */
function isNumericToken(token: string): boolean {
  return /^\d+$/.test(token);
}

// ---------------------------------------------------------------------------
// Core parsing
// ---------------------------------------------------------------------------

/** Looks up a single token as a 0-99 value across every vocabulary table
 * (Latin tens/digits, Devanagari tens/digits, English digit words). Returns
 * undefined if the token isn't a recognized number word. */
function lookupUnitOrTens(token: string): number | undefined {
  if (isNumericToken(token)) return parseInt(token, 10);
  if (token in TENS_WORDS_LATIN) return TENS_WORDS_LATIN[token];
  if (token in DIGIT_WORDS_LATIN) return DIGIT_WORDS_LATIN[token];
  if (token in TENS_WORDS_DEVANAGARI) return TENS_WORDS_DEVANAGARI[token];
  if (token in DIGIT_WORDS_DEVANAGARI) return DIGIT_WORDS_DEVANAGARI[token];
  if (token in ENGLISH_DIGIT_WORDS) return ENGLISH_DIGIT_WORDS[token];
  return undefined;
}

/** Looks up a single token as a scale multiplier (100 / 1,000 / 100,000 /
 * 10,000,000), across Latin, Devanagari, and English vocabularies. */
function lookupScale(token: string): number | undefined {
  if (token in SCALE_WORDS_LATIN) return SCALE_WORDS_LATIN[token];
  if (token in SCALE_WORDS_DEVANAGARI) return SCALE_WORDS_DEVANAGARI[token];
  if (token in ENGLISH_SCALE_WORDS) return ENGLISH_SCALE_WORDS[token];
  return undefined;
}

/**
 * Parses one maximal "number phrase" starting at `startIndex` in `tokens`.
 * A number phrase is a sequence like:
 *   [multiplier-idiom]? [unit-count]? [scale]? ([unit-count]? [scale]?)*
 * e.g. "do hazaar paanch sau" = 2 * 1000 + 5 * 100 = 2500
 *      "dhai hazaar"          = 2.5 * 1000          = 2500
 *      "sava sau"             = 1.25 * 100          = 125
 *      "paune do sau"         = 2 * 100 - 25         = 175
 *      "3 thousand"           = 3 * 1000            = 3000
 *
 * Returns undefined if no number phrase starts at startIndex.
 */
function parsePhraseAt(
  tokens: string[],
  startIndex: number
): { rupees: number; endIndex: number } | undefined {
  let i = startIndex;
  let total = 0;
  let matchedAny = false;

  // Handle a leading multiplier idiom (dedh/dhai/sava/paune), which combines
  // with the very next scale-bearing group only.
  const idiomWord = tokens[i];
  const idiom = idiomWord !== undefined ? MULTIPLIER_IDIOM_WORDS[idiomWord] : undefined;
  if (idiom) {
    // paune wants an optional unit count before the scale word, e.g.
    // "paune do sau" (paune + do[2] + sau[100]) or bare "paune sau" (=75,
    // i.e. paune implicitly means "one unit short a quarter" -> 0.75 * 100).
    let j = i + 1;
    let unitCount = 1;
    const maybeUnit = tokens[j];
    const unitVal = maybeUnit !== undefined ? lookupUnitOrTens(maybeUnit) : undefined;
    if (idiom !== "dhai" && idiom !== "dedh" && unitVal !== undefined && unitVal >= 1 && unitVal <= 9) {
      unitCount = unitVal;
      j += 1;
    }
    const scaleWord = tokens[j];
    const scaleVal = scaleWord !== undefined ? lookupScale(scaleWord) : undefined;
    if (scaleVal !== undefined) {
      let value: number;
      switch (idiom) {
        case "dedh":
          value = 1.5 * scaleVal;
          break;
        case "dhai":
          value = 2.5 * scaleVal;
          break;
        case "sava":
          value = unitCount * scaleVal + 0.25 * scaleVal;
          break;
        case "paune":
          // "paune X sau" = (X * scale) - 0.25 * scale, i.e. a quarter-unit
          // short of X scale-units. Bare "paune sau" = paune with implicit
          // unitCount=1 -> (1*100) - 25 = 75.
          value = unitCount * scaleVal - 0.25 * scaleVal;
          break;
      }
      return { rupees: value, endIndex: j + 1 };
    }
    // Idiom word not followed by a recognizable scale — not a valid phrase
    // via this path; fall through to treat it as ordinary text (no match).
    return undefined;
  }

  // General case: repeatedly consume [unit-count]? [scale] groups, e.g.
  // "do hazaar paanch sau pachaas" = 2000 + 500 + 50.
  // A trailing bare unit/tens value with no scale word (e.g. the "pachaas"
  // above, or a standalone "teen sau" already handled) is added directly.
  while (i < tokens.length) {
    const token = tokens[i];
    const unitVal = lookupUnitOrTens(token);

    if (unitVal !== undefined) {
      const nextToken = tokens[i + 1];
      const scaleVal = nextToken !== undefined ? lookupScale(nextToken) : undefined;
      if (scaleVal !== undefined) {
        total += unitVal * scaleVal;
        matchedAny = true;
        i += 2;
        continue;
      }
      // Bare unit/tens value with no following scale word. Only consume it
      // as part of THIS phrase if we haven't already matched a scaled group
      // (otherwise "...paanch sau pachaas" correctly adds the 50 as the
      // final ones-term) — but if nothing matched yet and there's no scale
      // at all, this is just a bare number like "500" via "paanch sau" ->
      // already handled above; a lone "paanch" with nothing else is also a
      // valid phrase (just "5").
      total += unitVal;
      matchedAny = true;
      i += 1;
      break; // a bare trailing unit ends the phrase
    }

    const scaleVal = lookupScale(token);
    if (scaleVal !== undefined) {
      // Scale word with no preceding unit (e.g. "hazaar" alone) implies 1x.
      total += scaleVal;
      matchedAny = true;
      i += 1;
      continue;
    }

    break; // token doesn't extend the number phrase
  }

  if (!matchedAny) return undefined;
  return { rupees: total, endIndex: i };
}

/**
 * Scans an entire transcript for spoken/written number phrases and returns
 * every one found, in order of appearance. Most callers want the FIRST or
 * LARGEST match (see parseSpokenAmount) but all matches are exposed for
 * callers that need to disambiguate (e.g. "500 rupees, baaki 100 udhaar").
 */
export function findAllAmounts(transcript: string): ParsedAmount[] {
  const tokens = tokenize(transcript);
  const results: ParsedAmount[] = [];
  let i = 0;
  while (i < tokens.length) {
    const parsed = parsePhraseAt(tokens, i);
    if (parsed && parsed.endIndex > i) {
      results.push({
        rupees: parsed.rupees,
        matchedText: tokens.slice(i, parsed.endIndex).join(" "),
      });
      i = parsed.endIndex;
    } else {
      i += 1;
    }
  }
  return results;
}

/**
 * Convenience wrapper: parses a transcript and returns the FIRST spoken
 * amount found, or undefined if none parses. This is the primary entry
 * point for cross-checking an LLM-extracted amount against the transcript's
 * own text (see src/lib/extract-helpers.ts).
 */
export function parseSpokenAmount(transcript: string): ParsedAmount | undefined {
  const all = findAllAmounts(transcript);
  return all[0];
}

/**
 * Parses a transcript and returns the LARGEST spoken amount found. Useful
 * when a transcript mentions both a total and a smaller remainder (e.g.
 * "2500 diye, baaki 500 udhaar" — the primary transaction amount is usually
 * the larger figure), though callers should treat this as a heuristic, not
 * a guarantee.
 */
export function parseLargestSpokenAmount(transcript: string): ParsedAmount | undefined {
  const all = findAllAmounts(transcript);
  if (all.length === 0) return undefined;
  return all.reduce((max, cur) => (cur.rupees > max.rupees ? cur : max));
}
