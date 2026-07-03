/**
 * Single source of truth for every UI string in the app. Hindi (Devanagari)
 * is the default language; English is available via a toggle. Amounts are
 * NEVER translated here — they always render with Latin numerals and ₹
 * (see src/lib/ledger.ts formatPaiseToRupees).
 *
 * Usage: const { t } = useI18n(); ... t.home.title
 */

import type { AiErrorCode } from "./ai-config";

export type Language = "hi" | "en";

export interface Strings {
  common: {
    appName: string;
    save: string;
    cancel: string;
    delete: string;
    undo: string;
    back: string;
    comingSoon: string;
    retry: string;
  };
  home: {
    title: string;
    micHint: string;
    photoHint: string;
    partiesTitle: string;
    noParties: string;
    addEntry: string;
    balanceTheyOwe: string;
    balanceYouOwe: string;
    settled: string;
  };
  party: {
    pickTitle: string;
    searchOrAddPlaceholder: string;
    addNewParty: string;
    newPartyNamePlaceholder: string;
    newPartyPhonePlaceholder: string;
    createAndContinue: string;
  };
  amount: {
    title: string;
    continue: string;
  };
  direction: {
    title: string;
    received: string;
    paid: string;
  };
  confirm: {
    title: string;
    partyLabel: string;
    amountLabel: string;
    directionLabel: string;
    noteLabel: string;
    notePlaceholder: string;
    save: string;
  };
  snackbar: {
    saved: string;
    deleted: string;
  };
  ledger: {
    title: string;
    balanceTitle: string;
    noEntries: string;
    dateToday: string;
    dateYesterday: string;
  };
  voice: {
    recordingHint: string;
    stop: string;
    uploading: string;
    extracting: string;
    youSaidLabel: string;
    confirmTitle: string;
    reviewBannerAmount: string;
    reviewBannerParty: string;
    llmSaid: string;
    weHeard: string;
    createPartyConfirm: string;
    micPermissionDenied: string;
    errors: Record<AiErrorCode, string>;
  };
}

const hi: Strings = {
  common: {
    appName: "मुंशी",
    save: "सेव करें",
    cancel: "रद्द करें",
    delete: "मिटाएं",
    undo: "पूर्ववत करें",
    back: "पीछे",
    comingSoon: "यह सुविधा जल्द आ रही है",
    retry: "फिर कोशिश करें",
  },
  home: {
    title: "मुंशी",
    micHint: "बोलकर एंट्री जोड़ें",
    photoHint: "बिल की फोटो (जल्द आ रहा है)",
    partiesTitle: "खाते",
    noParties: "अभी कोई खाता नहीं है। + दबाकर शुरू करें।",
    addEntry: "नई एंट्री",
    balanceTheyOwe: "आपको मिलेंगे",
    balanceYouOwe: "आपको देना है",
    settled: "हिसाब बराबर",
  },
  party: {
    pickTitle: "किसका हिसाब?",
    searchOrAddPlaceholder: "नाम खोजें या लिखें",
    addNewParty: "नया व्यक्ति जोड़ें",
    newPartyNamePlaceholder: "नाम लिखें",
    newPartyPhonePlaceholder: "मोबाइल नंबर (वैकल्पिक)",
    createAndContinue: "आगे बढ़ें",
  },
  amount: {
    title: "राशि डालें",
    continue: "आगे",
  },
  direction: {
    title: "पैसा किस तरफ गया?",
    received: "पैसे आए",
    paid: "पैसे दिए",
  },
  confirm: {
    title: "जांच लें",
    partyLabel: "किससे/किसको",
    amountLabel: "राशि",
    directionLabel: "प्रकार",
    noteLabel: "टिप्पणी",
    notePlaceholder: "कुछ लिखें (वैकल्पिक)",
    save: "सेव करें",
  },
  snackbar: {
    saved: "एंट्री सेव हो गई",
    deleted: "एंट्री मिटा दी गई",
  },
  ledger: {
    title: "खाता",
    balanceTitle: "बाकी हिसाब",
    noEntries: "अभी कोई एंट्री नहीं है",
    dateToday: "आज",
    dateYesterday: "कल",
  },
  voice: {
    recordingHint: "बोलिए...",
    stop: "रोकें",
    uploading: "भेजा जा रहा है...",
    extracting: "समझा जा रहा है...",
    youSaidLabel: "आपने कहा:",
    confirmTitle: "जांच लें",
    reviewBannerAmount: "राशि जांच लें",
    reviewBannerParty: "यह नया व्यक्ति है",
    llmSaid: "AI ने सुना",
    weHeard: "हमने सुना",
    createPartyConfirm: "नया व्यक्ति जोड़ें",
    micPermissionDenied: "माइक की अनुमति दें",
    errors: {
      missing_api_key: "आवाज़ सुविधा अभी उपलब्ध नहीं है",
      upstream_error: "कुछ गड़बड़ हुई, फिर कोशिश करें",
      invalid_audio: "आवाज़ रिकॉर्ड नहीं हो पाई, फिर बोलें",
      invalid_request: "कुछ गड़बड़ हुई, फिर कोशिश करें",
      timeout: "जवाब में देर हो रही है, फिर कोशिश करें",
    },
  },
};

const en: Strings = {
  common: {
    appName: "Munshi",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    undo: "Undo",
    back: "Back",
    comingSoon: "Coming soon",
    retry: "Try again",
  },
  home: {
    title: "Munshi",
    micHint: "Speak to add an entry",
    photoHint: "Photo of bill (coming soon)",
    partiesTitle: "Accounts",
    noParties: "No accounts yet. Tap + to start.",
    addEntry: "New Entry",
    balanceTheyOwe: "They owe you",
    balanceYouOwe: "You owe them",
    settled: "Settled",
  },
  party: {
    pickTitle: "Whose account?",
    searchOrAddPlaceholder: "Search or type a name",
    addNewParty: "Add new person",
    newPartyNamePlaceholder: "Enter name",
    newPartyPhonePlaceholder: "Phone number (optional)",
    createAndContinue: "Continue",
  },
  amount: {
    title: "Enter amount",
    continue: "Continue",
  },
  direction: {
    title: "Which way did the money go?",
    received: "Money Received",
    paid: "Money Paid",
  },
  confirm: {
    title: "Confirm entry",
    partyLabel: "With",
    amountLabel: "Amount",
    directionLabel: "Type",
    noteLabel: "Note",
    notePlaceholder: "Add a note (optional)",
    save: "Save",
  },
  snackbar: {
    saved: "Entry saved",
    deleted: "Entry deleted",
  },
  ledger: {
    title: "Ledger",
    balanceTitle: "Balance",
    noEntries: "No entries yet",
    dateToday: "Today",
    dateYesterday: "Yesterday",
  },
  voice: {
    recordingHint: "Listening...",
    stop: "Stop",
    uploading: "Uploading...",
    extracting: "Understanding...",
    youSaidLabel: "You said:",
    confirmTitle: "Confirm entry",
    reviewBannerAmount: "Please check the amount",
    reviewBannerParty: "This looks like a new contact",
    llmSaid: "AI heard",
    weHeard: "We heard",
    createPartyConfirm: "Add new person",
    micPermissionDenied: "Please allow microphone access",
    errors: {
      missing_api_key: "Voice feature is not available right now",
      upstream_error: "Something went wrong, please try again",
      invalid_audio: "Couldn't record audio, please try again",
      invalid_request: "Something went wrong, please try again",
      timeout: "This is taking too long, please try again",
    },
  },
};

export const translations: Record<Language, Strings> = { hi, en };

export const DEFAULT_LANGUAGE: Language = "hi";

export const LANGUAGE_STORAGE_KEY = "munshi.language";
