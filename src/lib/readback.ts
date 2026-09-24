/**
 * Spoken-language sentence builders for Step 3's text-to-speech read-back.
 *
 * Pure module: no I/O, no DOM, no fetch. Every function here takes plain
 * data and returns a plain string meant to be handed to speech.ts's
 * speak(text, lang). Kept separate from i18n.ts on purpose: i18n.ts holds
 * static UI labels (button text, headings), while this module holds
 * *grammar* — sentences assembled from caller-supplied parameters (amounts,
 * party names, dates) in either Hindi or English.
 *
 * IMPORTANT for amountToWords: Hindi's 1-99 number words are irregular
 * (not computable from a tens+units formula the way English's are), so this
 * module carries its OWN complete, explicit 0-99 Devanagari lookup table
 * rather than reusing hindi-numbers.ts's tables (those exist to *parse*
 * spoken numbers out of noisy STT transcripts, a different job with
 * different accuracy tradeoffs, and are partial in places that don't matter
 * for parsing but would matter for speaking a number back correctly).
 */

import { theyOweYou } from "./ledger";
import type { Language } from "./i18n";
import type { TransactionDirection } from "./types";
import type { FieldReviewFlags } from "./voice-confirm-helpers";
import { parseLargestSpokenAmount } from "./hindi-numbers";
import { matchPartyName } from "./extract-helpers";

// ---------------------------------------------------------------------------
// Hindi 0-99 Devanagari number words (complete, explicit — see module doc).
// Cross-checked against standard Hindi numeral references. A couple of
// values (53, 63, 95) have two attested spellings in common use (तिरपन/
// तिरेपन, तिरसठ/तिरेसठ, पंचानवे/पचानवे) — the shorter/more common textbook
// form is used here. 79 follows the product spec's explicit spelling
// (उन्यासी) over the less common उन्नासी variant.
// ---------------------------------------------------------------------------
const HI_0_99: readonly string[] = [
  "शून्य",
  "एक",
  "दो",
  "तीन",
  "चार",
  "पाँच",
  "छह",
  "सात",
  "आठ",
  "नौ",
  "दस",
  "ग्यारह",
  "बारह",
  "तेरह",
  "चौदह",
  "पंद्रह",
  "सोलह",
  "सत्रह",
  "अठारह",
  "उन्नीस",
  "बीस",
  "इक्कीस",
  "बाईस",
  "तेईस",
  "चौबीस",
  "पच्चीस",
  "छब्बीस",
  "सत्ताईस",
  "अट्ठाईस",
  "उनतीस",
  "तीस",
  "इकतीस",
  "बत्तीस",
  "तैंतीस",
  "चौंतीस",
  "पैंतीस",
  "छत्तीस",
  "सैंतीस",
  "अड़तीस",
  "उनतालीस",
  "चालीस",
  "इकतालीस",
  "बयालीस",
  "तैंतालीस",
  "चवालीस",
  "पैंतालीस",
  "छियालीस",
  "सैंतालीस",
  "अड़तालीस",
  "उनचास",
  "पचास",
  "इक्यावन",
  "बावन",
  "तिरपन",
  "चौवन",
  "पचपन",
  "छप्पन",
  "सत्तावन",
  "अट्ठावन",
  "उनसठ",
  "साठ",
  "इकसठ",
  "बासठ",
  "तिरसठ",
  "चौंसठ",
  "पैंसठ",
  "छियासठ",
  "सड़सठ",
  "अड़सठ",
  "उनहत्तर",
  "सत्तर",
  "इकहत्तर",
  "बहत्तर",
  "तिहत्तर",
  "चौहत्तर",
  "पचहत्तर",
  "छिहत्तर",
  "सतहत्तर",
  "अठहत्तर",
  "उन्यासी",
  "अस्सी",
  "इक्यासी",
  "बयासी",
  "तिरासी",
  "चौरासी",
  "पचासी",
  "छियासी",
  "सत्तासी",
  "अट्ठासी",
  "नवासी",
  "नब्बे",
  "इक्यानवे",
  "बानवे",
  "तिरानवे",
  "चौरानवे",
  "पंचानवे",
  "छियानवे",
  "सत्तानवे",
  "अट्ठानवे",
  "निन्यानवे",
];

function hindiUnits99(n: number): string {
  return HI_0_99[n] ?? String(n);
}

/** Hindi words for a 0-999 group (used for the crore multiplier, which can
 * itself exceed 99 for very large amounts — unlikely in this domain, but
 * handled correctly rather than silently truncated). */
function hindiHundredsGroup(n: number): string {
  if (n < 100) return hindiUnits99(n);
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  return rem > 0 ? `${hindiUnits99(hundreds)} सौ ${hindiUnits99(rem)}` : `${hindiUnits99(hundreds)} सौ`;
}

/** Converts a nonnegative integer rupee count into Hindi words using Indian
 * grouping (करोड़ / लाख / हज़ार / सौ). Does not include the currency word. */
function hindiRupeesToWords(rupees: number): string {
  if (rupees === 0) return "शून्य";

  const crore = Math.floor(rupees / 1_00_00_000);
  let rem = rupees % 1_00_00_000;
  const lakh = Math.floor(rem / 1_00_000);
  rem %= 1_00_000;
  const hazaar = Math.floor(rem / 1000);
  rem %= 1000;
  const sau = Math.floor(rem / 100);
  const units = rem % 100;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${hindiHundredsGroup(crore)} करोड़`);
  if (lakh > 0) parts.push(`${hindiUnits99(lakh)} लाख`);
  if (hazaar > 0) parts.push(`${hindiUnits99(hazaar)} हज़ार`);
  if (sau > 0) parts.push(`${hindiUnits99(sau)} सौ`);
  if (units > 0) parts.push(hindiUnits99(units));
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// English 0-99 words. English tens/ones ARE a regular computed pattern
// (unlike Hindi), so a small table + combiner is sufficient and correct.
// ---------------------------------------------------------------------------
const EN_ONES_0_19: readonly string[] = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const EN_TENS: readonly string[] = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

function englishUnits99(n: number): string {
  if (n < 20) return EN_ONES_0_19[n] ?? String(n);
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? EN_TENS[tens] : `${EN_TENS[tens]}-${EN_ONES_0_19[ones]}`;
}

/** English words for a 0-999 group (used for the crore multiplier). */
function englishHundredsGroup(n: number): string {
  if (n < 100) return englishUnits99(n);
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  return rem > 0
    ? `${EN_ONES_0_19[hundreds]} hundred ${englishUnits99(rem)}`
    : `${EN_ONES_0_19[hundreds]} hundred`;
}

/** Converts a nonnegative integer rupee count into English words using
 * Indian grouping (crore / lakh / thousand / hundred). No currency word. */
function englishRupeesToWords(rupees: number): string {
  if (rupees === 0) return "zero";

  const crore = Math.floor(rupees / 1_00_00_000);
  let rem = rupees % 1_00_00_000;
  const lakh = Math.floor(rem / 1_00_000);
  rem %= 1_00_000;
  const thousand = Math.floor(rem / 1000);
  rem %= 1000;
  const hundred = Math.floor(rem / 100);
  const units = rem % 100;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${englishHundredsGroup(crore)} crore`);
  if (lakh > 0) parts.push(`${englishUnits99(lakh)} lakh`);
  if (thousand > 0) parts.push(`${englishUnits99(thousand)} thousand`);
  if (hundred > 0) parts.push(`${englishUnits99(hundred)} hundred`);
  if (units > 0) parts.push(englishUnits99(units));
  return parts.join(" ");
}

/**
 * Converts an integer paise amount into a fully spoken words string,
 * including the currency word(s), in either language. Never throws —
 * invalid input (negative/NaN) is treated as zero, since this only ever
 * feeds a spoken sentence and must not crash the confirm screen.
 *
 * Hindi currency word: "रुपया" for exactly 1 rupee, "रुपये" otherwise
 * (including 0). A paise-only amount (0 rupees, >0 paise) omits the rupee
 * word entirely, e.g. "पचास पैसे". A wholly-zero amount is "शून्य रुपये".
 *
 * English mirrors this with "rupee"/"rupees" and "paise" (English "paise"
 * is already invariant in Indian English, so no singular/plural split is
 * needed there).
 *
 * Note: unlike रुपया/रुपये, this module does NOT special-case a "पैसा"
 * (singular) form for exactly 1 paisa — the spec's grammar rules only
 * define the rupaya/rupaye split, so "पैसे" is kept invariant for every
 * paise count, including 1. See the module's final report for this
 * deliberate simplification.
 */
export function amountToWords(paise: number, lang: Language): string {
  const safePaise = Number.isFinite(paise) ? Math.max(0, Math.round(paise)) : 0;

  if (safePaise === 0) return lang === "hi" ? "शून्य रुपये" : "zero rupees";

  const rupees = Math.floor(safePaise / 100);
  const paiseRemainder = safePaise % 100;

  if (rupees === 0) {
    const paiseWords = lang === "hi" ? hindiUnits99(paiseRemainder) : englishUnits99(paiseRemainder);
    return lang === "hi" ? `${paiseWords} पैसे` : `${paiseWords} paise`;
  }

  const rupeeWords = lang === "hi" ? hindiRupeesToWords(rupees) : englishRupeesToWords(rupees);
  const currencyWord =
    lang === "hi" ? (rupees === 1 ? "रुपया" : "रुपये") : rupees === 1 ? "rupee" : "rupees";

  let result = `${rupeeWords} ${currencyWord}`;

  if (paiseRemainder > 0) {
    const paiseWords = lang === "hi" ? hindiUnits99(paiseRemainder) : englishUnits99(paiseRemainder);
    result += lang === "hi" ? ` और ${paiseWords} पैसे` : ` and ${paiseWords} paise`;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sentence builders
// ---------------------------------------------------------------------------

export interface ConfirmationInput {
  party: string;
  amountPaise: number;
  direction: TransactionDirection;
  /** True when `party` is present but doesn't match an existing contact —
   * a brand-new account. The spoken sentence then adds a short heads-up
   * that a new account will be opened, so the shopkeeper isn't surprised
   * later by an unfamiliar name suddenly appearing in their ledger.
   * Omitted/false plays exactly the original sentence with no extra
   * clause (the manual entry flow, which always uses an existing party,
   * never needs this). */
  newParty?: boolean;
}

function hindiCoreClause(direction: TransactionDirection, party: string, amountWords: string): string {
  return direction === "paid" ? `${party} को ${amountWords} दिए` : `${party} से ${amountWords} आए`;
}

/** English core clause, lowercase-first so it composes naturally either at
 * a sentence start (confirmationText capitalizes it) or mid-sentence after
 * a comma (entryText's day-phrase lead-in). */
function englishCoreClause(direction: TransactionDirection, party: string, amountWords: string): string {
  return direction === "paid" ? `paid ${amountWords} to ${party}` : `received ${amountWords} from ${party}`;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Builds the spoken confirm-screen question, e.g. "Ramesh को पाँच सौ रुपये
 * दिए। सही है?" / "Paid five hundred rupees to Ramesh. Is that right?".
 * When `input.newParty` is true, inserts an extra sentence announcing that
 * a new account will be opened for `party`, e.g. "Suresh से तीन हज़ार
 * रुपये आए। Suresh का नया खाता बनेगा। सही है?" / "Received three thousand
 * rupees from Suresh. This will open a new account for Suresh. Is that
 * right?" */
export function confirmationText(input: ConfirmationInput, lang: Language): string {
  const amountWords = amountToWords(input.amountPaise, lang);
  if (lang === "hi") {
    const core = hindiCoreClause(input.direction, input.party, amountWords);
    const newAccountClause = input.newParty ? ` ${input.party} का नया खाता बनेगा।` : "";
    return `${core}।${newAccountClause} सही है?`;
  }
  const core = capitalize(englishCoreClause(input.direction, input.party, amountWords));
  const newAccountClause = input.newParty ? ` This will open a new account for ${input.party}.` : "";
  return `${core}.${newAccountClause} Is that right?`;
}

const HI_MONTHS: readonly string[] = [
  "जनवरी",
  "फ़रवरी",
  "मार्च",
  "अप्रैल",
  "मई",
  "जून",
  "जुलाई",
  "अगस्त",
  "सितंबर",
  "अक्तूबर",
  "नवंबर",
  "दिसंबर",
];

const EN_MONTHS: readonly string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Spoken day phrase for entryText: "आज"/"today", "कल"/"yesterday", or a
 * dateless-year "3 जुलाई"/"3 July" for anything older. `now` is an explicit
 * parameter (not `new Date()`) so this stays deterministic under test. */
function dayPhrase(createdAtIso: string, lang: Language, now: Date): string {
  const created = new Date(createdAtIso);
  const diffDays = Math.round((startOfDay(now) - startOfDay(created)) / 86_400_000);
  if (diffDays === 0) return lang === "hi" ? "आज" : "today";
  if (diffDays === 1) return lang === "hi" ? "कल" : "yesterday";
  const months = lang === "hi" ? HI_MONTHS : EN_MONTHS;
  return `${created.getDate()} ${months[created.getMonth()]}`;
}

export interface EntryTextInput {
  party: string;
  amountPaise: number;
  direction: TransactionDirection;
  note?: string;
  /** ISO-8601 timestamp string (Transaction.created_at). */
  createdAt: string;
}

/** Builds the spoken sentence for "tap an entry to hear it" on the party
 * ledger: a day phrase, the same core sentence as confirmationText but
 * without the trailing question, then the note (if any). `now` is explicit
 * for testability. */
export function entryText(input: EntryTextInput, lang: Language, now: Date): string {
  const amountWords = amountToWords(input.amountPaise, lang);
  const day = dayPhrase(input.createdAt, lang, now);
  const trimmedNote = input.note?.trim();

  if (lang === "hi") {
    const core = hindiCoreClause(input.direction, input.party, amountWords);
    const noteClause = trimmedNote ? ` नोट: ${trimmedNote}।` : "";
    return `${day}, ${core}।${noteClause}`;
  }

  const core = englishCoreClause(input.direction, input.party, amountWords);
  const noteClause = trimmedNote ? ` Note: ${trimmedNote}.` : "";
  return `${capitalize(day)}, ${core}.${noteClause}`;
}

/** Builds the spoken balance for a party, following the Khatabook udhaar
 * convention in ledger.ts's theyOweYou (balance <= 0 means they owe you). */
export function balanceText(party: string, balancePaise: number, lang: Language): string {
  if (balancePaise === 0) {
    return lang === "hi" ? `${party} का हिसाब बराबर है।` : `${party}'s account is settled.`;
  }

  const amountWords = amountToWords(Math.abs(balancePaise), lang);
  if (theyOweYou(balancePaise)) {
    return lang === "hi" ? `${party} से ${amountWords} लेने हैं।` : `${party} owes you ${amountWords}.`;
  }
  return lang === "hi" ? `${party} को ${amountWords} देने हैं।` : `You owe ${party} ${amountWords}.`;
}

export type ClarifyField = "party" | "amount" | "direction";

const CLARIFYING_QUESTIONS: Record<ClarifyField, Record<Language, string>> = {
  party: {
    hi: "किसका हिसाब है? नाम बोलिए।",
    en: "Whose account is this? Say the name.",
  },
  amount: {
    hi: "कितने रुपये? रकम बोलिए।",
    en: "How many rupees? Say the amount.",
  },
  direction: {
    hi: "पैसे आए या दिए? हरा या लाल बटन दबाइए।",
    en: "Did the money come in or go out? Press the green or red button.",
  },
};

/** A single short spoken clarifying question for an uncertain field. */
export function clarifyingQuestion(field: ClarifyField, lang: Language): string {
  return CLARIFYING_QUESTIONS[field][lang];
}

/** Picks the single highest-priority field that still needs a SPOKEN
 * clarifying question. This is deliberately narrower than the confirm
 * screen's visual review banners (computeFieldReviewFlags): asking
 * "किसका हिसाब है? नाम बोलिए।" makes sense only when NOTHING was heard for
 * the party at all — a party that IS present but simply doesn't match an
 * existing contact is a normal brand-new customer, not something to
 * re-ask about (confirmationText's `newParty` announces it instead). So
 * "party" is returned only when `values.party` is empty; "amount" is
 * returned when computeFieldReviewFlags flagged it (a disagreement or low
 * confidence) OR the parsed amount is unusable (<= 0), even if nothing
 * flagged it. Party still takes priority when both need attention. */
export function pickQuestionField(
  values: { party: string; amountPaise: number },
  flags: FieldReviewFlags
): "party" | "amount" | null {
  if (values.party.trim() === "") return "party";
  if (flags.amount || values.amountPaise <= 0) return "amount";
  return null;
}

// ---------------------------------------------------------------------------
// Pure answer parsers for the spoken reply to a clarifying question.
// ---------------------------------------------------------------------------

/** Parses a spoken amount answer (e.g. "paanch sau") into integer paise, or
 * null if nothing numeric could be mechanically parsed from the reply. */
export function parseAmountAnswer(transcript: string): number | null {
  const parsed = parseLargestSpokenAmount(transcript);
  if (!parsed) return null;
  return Math.round(parsed.rupees * 100);
}

/** Filler words a shopkeeper's spoken reply to "किसका हिसाब है?" commonly
 * contains around the actual name ("Ramesh ka naam hai" -> "Ramesh"). Only
 * stripped as whole words so they never eat into a real name that happens
 * to contain these letters. */
const PARTY_FILLER_WORD_PATTERN = /\b(ka\s+naam|naam|hai)\b/gi;
const PARTY_FILLER_DEVANAGARI_PATTERN = /है/g;
const TRAILING_PUNCTUATION_PATTERN = /[.,!?।\s]+$/;

/** Strips trailing punctuation and common filler words ("Ramesh ka naam
 * hai" -> "Ramesh") from a spoken party-answer transcript, WITHOUT doing
 * any matching against existing parties — see parsePartyAnswer below for
 * the local fuzzy-matched version. Exported so the voice page can send
 * this cleaned text straight to /api/match-party: matching a cleaned name
 * against the party list (including cross-script cases matchPartyName
 * can't resolve on its own) is that route's job, not a local concern. */
export function cleanPartyTranscript(raw: string): string {
  return raw
    .trim()
    .replace(TRAILING_PUNCTUATION_PATTERN, "")
    .replace(PARTY_FILLER_WORD_PATTERN, " ")
    .replace(PARTY_FILLER_DEVANAGARI_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parses a spoken party-name answer: matches against existing party names
 * via matchPartyName (extract-helpers.ts) after stripping trailing
 * punctuation and common filler words, falling back to the cleaned
 * transcript as a brand-new name. Returns null when nothing usable was
 * heard (e.g. the reply was silence, or only filler words). */
export function parsePartyAnswer(transcript: string, existingNames: readonly string[]): string | null {
  const cleaned = cleanPartyTranscript(transcript);
  if (!cleaned) return null;
  const { name } = matchPartyName(cleaned, existingNames);
  return name.trim() || null;
}
