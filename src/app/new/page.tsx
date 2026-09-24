"use client";

/**
 * Manual entry flow — the workhorse screen for Step 1.
 *
 * Steps (one decision per screen, per spec):
 *   1. party    — pick an existing party or create a new one
 *   2. amount   — huge custom number pad, amount shown large, rupees in
 *   3. direction — two huge buttons: green "पैसे आए" / red "पैसे दिए"
 *   4. confirm  — review icons + amount + party, optional note, then save
 *
 * On save: write to Dexie via repo.ts, show an undo snackbar, and return to
 * Home. Undo fully removes the just-created transaction.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import { useParties } from "@/lib/useParties";
import { createParty, createTransaction, deleteTransactionPermanently } from "@/lib/repo";
import { formatPaiseToRupees, parseAmountInputToPaise } from "@/lib/ledger";
import { confirmationText } from "@/lib/readback";
import { useSpeech } from "@/lib/speech";
import { useSnackbar } from "@/components/Snackbar";
import { NumberPad } from "@/components/NumberPad";
import { SpeakButton } from "@/components/SpeakButton";
import {
  BackIcon,
  MoneyInIcon,
  MoneyOutIcon,
  PersonIcon,
  PlusIcon,
  CheckIcon,
  CrossIcon,
  PencilIcon,
} from "@/components/icons";
import type { Language } from "@/lib/i18n";
import type { Party, TransactionDirection } from "@/lib/types";

type Step = "party" | "amount" | "direction" | "confirm";

const MAX_AMOUNT_DIGITS_BEFORE_DECIMAL = 8; // guards against absurd typos, not a real business limit

export default function NewEntryPage() {
  const router = useRouter();
  const { t, language } = useI18n();
  const { show } = useSnackbar();
  const { speak } = useSpeech();
  const { parties, loading: partiesLoading, refresh: refreshParties } = useParties();

  const [step, setStep] = useState<Step>("party");
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [direction, setDirection] = useState<TransactionDirection | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [nameQuery, setNameQuery] = useState("");

  const filteredParties = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((p) => p.name.toLowerCase().includes(q));
  }, [parties, nameQuery]);

  const exactMatchExists = parties.some(
    (p) => p.name.trim().toLowerCase() === nameQuery.trim().toLowerCase()
  );

  const amountPaise = parseAmountInputToPaise(amountInput);

  // The spoken confirm-screen sentence — computed once here so both the
  // auto-speak effect below and the SpeakButton's replay use the exact
  // same text.
  const spokenConfirmation = useMemo(() => {
    if (!selectedParty || !direction) return "";
    return confirmationText({ party: selectedParty.name, amountPaise, direction }, language);
  }, [selectedParty, direction, amountPaise, language]);

  // Auto-speak as soon as the confirm step is entered (per the product
  // spec: every entry must be readable back BY EAR). Only re-fires when
  // `step` itself changes — not on every keystroke in the note field.
  useEffect(() => {
    if (step === "confirm" && spokenConfirmation) {
      void speak(spokenConfirmation, language);
    }
  }, [step, spokenConfirmation, speak, language]);

  function goBack() {
    if (step === "amount") setStep("party");
    else if (step === "direction") setStep("amount");
    else if (step === "confirm") setStep("direction");
    else router.push("/");
  }

  function handleSelectParty(party: Party) {
    setSelectedParty(party);
    setStep("amount");
  }

  async function handleCreateParty() {
    const name = nameQuery.trim();
    if (!name) return;
    const party = await createParty({ name });
    await refreshParties();
    setSelectedParty(party);
    setNameQuery("");
    setStep("amount");
  }

  function handleDigit(digit: string) {
    setAmountInput((prev) => {
      const [wholePart] = prev.split(".");
      if (!prev.includes(".") && wholePart.length >= MAX_AMOUNT_DIGITS_BEFORE_DECIMAL) {
        return prev;
      }
      if (prev.includes(".")) {
        const [w, f = ""] = prev.split(".");
        if (f.length >= 2) return prev; // paise precision cap
        return `${w}.${f}${digit}`;
      }
      if (prev === "0") return digit;
      return prev + digit;
    });
  }

  function handleDecimalPoint() {
    setAmountInput((prev) => (prev.includes(".") ? prev : `${prev || "0"}.`));
  }

  function handleBackspace() {
    setAmountInput((prev) => prev.slice(0, -1));
  }

  function handleAmountContinue() {
    if (amountPaise <= 0) return;
    setStep("direction");
  }

  function handleChooseDirection(dir: TransactionDirection) {
    setDirection(dir);
    setStep("confirm");
  }

  async function handleSave() {
    if (!selectedParty || !direction || amountPaise <= 0) return;
    setSaving(true);
    try {
      const created = await createTransaction({
        party_id: selectedParty.id,
        amount_paise: amountPaise,
        direction,
        note: note.trim() || undefined,
        source: "manual",
      });
      show(t.snackbar.saved, {
        undoLabel: t.common.undo,
        onUndo: () => {
          deleteTransactionPermanently(created.id);
        },
      });
      // Fire-and-forget: speech.ts's player is a module-level singleton, so
      // this keeps playing across the router.push below even though this
      // component unmounts.
      void speak(t.snackbar.saved, language);
      router.push("/");
    } finally {
      setSaving(false);
    }
  }

  /** The confirm step's red ✗: nothing has been persisted yet at this
   * point (createTransaction only runs in handleSave), so "discard" is
   * simply abandoning the draft and returning home — no undo needed. */
  function handleDiscardConfirm() {
    router.push("/");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-2 px-2 pt-[max(env(safe-area-inset-top),1rem)] pb-2">
        <button
          type="button"
          onClick={goBack}
          aria-label={t.common.back}
          className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-full text-neutral-600 active:bg-neutral-100"
        >
          <BackIcon className="h-7 w-7" />
        </button>
        <StepTitle step={step} />
      </header>

      {step === "party" && (
        <PartyStep
          loading={partiesLoading}
          parties={filteredParties}
          nameQuery={nameQuery}
          onQueryChange={setNameQuery}
          onSelect={handleSelectParty}
          onCreate={handleCreateParty}
          exactMatchExists={exactMatchExists}
        />
      )}

      {step === "amount" && (
        <AmountStep
          amountInput={amountInput}
          amountPaise={amountPaise}
          onDigit={handleDigit}
          onDecimalPoint={handleDecimalPoint}
          onBackspace={handleBackspace}
          onContinue={handleAmountContinue}
        />
      )}

      {step === "direction" && <DirectionStep onChoose={handleChooseDirection} />}

      {step === "confirm" && selectedParty && direction && (
        <ConfirmStep
          party={selectedParty}
          amountPaise={amountPaise}
          direction={direction}
          note={note}
          onNoteChange={setNote}
          saving={saving}
          onSave={handleSave}
          onDiscard={handleDiscardConfirm}
          spokenText={spokenConfirmation}
          language={language}
        />
      )}
    </div>
  );
}

function StepTitle({ step }: { step: Step }) {
  const { t } = useI18n();
  const titles: Record<Step, string> = {
    party: t.party.pickTitle,
    amount: t.amount.title,
    direction: t.direction.title,
    confirm: t.confirm.title,
  };
  return <h1 className="text-lg font-bold text-neutral-800">{titles[step]}</h1>;
}

interface PartyStepProps {
  loading: boolean;
  parties: Party[];
  nameQuery: string;
  onQueryChange: (q: string) => void;
  onSelect: (party: Party) => void;
  onCreate: () => void;
  exactMatchExists: boolean;
}

function PartyStep({
  loading,
  parties,
  nameQuery,
  onQueryChange,
  onSelect,
  onCreate,
  exactMatchExists,
}: PartyStepProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
      <input
        type="text"
        value={nameQuery}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t.party.searchOrAddPlaceholder}
        className="min-h-[56px] w-full rounded-2xl border-2 border-neutral-200 px-4 text-lg focus:border-green-600 focus:outline-none"
      />

      {nameQuery.trim() !== "" && !exactMatchExists && (
        <button
          type="button"
          onClick={onCreate}
          className="flex min-h-[64px] items-center gap-3 rounded-2xl bg-green-50 px-4 text-left active:bg-green-100"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
            <PlusIcon className="h-6 w-6" />
          </span>
          <span className="text-base font-semibold text-green-800">
            {t.party.addNewParty}: {nameQuery.trim()}
          </span>
        </button>
      )}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {!loading &&
          parties.map((party) => (
            <button
              key={party.id}
              type="button"
              onClick={() => onSelect(party)}
              className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 text-left active:bg-neutral-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                <PersonIcon className="h-6 w-6" />
              </span>
              <span className="text-lg font-medium text-neutral-900">{party.name}</span>
            </button>
          ))}
      </div>
    </div>
  );
}

interface AmountStepProps {
  amountInput: string;
  amountPaise: number;
  onDigit: (digit: string) => void;
  onDecimalPoint: () => void;
  onBackspace: () => void;
  onContinue: () => void;
}

function AmountStep({
  amountInput,
  amountPaise,
  onDigit,
  onDecimalPoint,
  onBackspace,
  onContinue,
}: AmountStepProps) {
  const { t } = useI18n();
  const displayValue = amountInput === "" ? "0" : amountInput;

  return (
    <div className="flex flex-1 flex-col justify-between px-4 pb-4">
      <div className="flex flex-1 items-center justify-center">
        <span className="amount-numerals text-6xl font-extrabold text-neutral-900">
          ₹{displayValue}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <NumberPad onDigit={onDigit} onBackspace={onBackspace} onDecimalPoint={onDecimalPoint} />
        <button
          type="button"
          onClick={onContinue}
          disabled={amountPaise <= 0}
          className="min-h-[64px] rounded-2xl bg-neutral-900 text-lg font-bold text-white disabled:bg-neutral-300 active:bg-neutral-800"
        >
          {t.amount.continue}
        </button>
      </div>
    </div>
  );
}

function DirectionStep({ onChoose }: { onChoose: (dir: TransactionDirection) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
      <button
        type="button"
        onClick={() => onChoose("received")}
        className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl bg-green-600 text-white active:bg-green-700"
      >
        <MoneyInIcon className="h-20 w-20" />
        <span className="text-2xl font-extrabold">{t.direction.received}</span>
      </button>
      <button
        type="button"
        onClick={() => onChoose("paid")}
        className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl bg-red-600 text-white active:bg-red-700"
      >
        <MoneyOutIcon className="h-20 w-20" />
        <span className="text-2xl font-extrabold">{t.direction.paid}</span>
      </button>
    </div>
  );
}

interface ConfirmStepProps {
  party: Party;
  amountPaise: number;
  direction: TransactionDirection;
  note: string;
  onNoteChange: (note: string) => void;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  spokenText: string;
  language: Language;
}

function ConfirmStep({
  party,
  amountPaise,
  direction,
  note,
  onNoteChange,
  saving,
  onSave,
  onDiscard,
  spokenText,
  language,
}: ConfirmStepProps) {
  const { t } = useI18n();
  const isReceived = direction === "received";

  return (
    <div className="flex flex-1 flex-col justify-between px-4 pb-4">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <SpeakButton text={spokenText} lang={language} />

        <span
          className={`flex h-24 w-24 items-center justify-center rounded-full ${
            isReceived ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
          }`}
        >
          {isReceived ? (
            <MoneyInIcon className="h-14 w-14" />
          ) : (
            <MoneyOutIcon className="h-14 w-14" />
          )}
        </span>

        <span
          className={`amount-numerals text-5xl font-extrabold ${
            isReceived ? "text-green-600" : "text-red-600"
          }`}
        >
          {formatPaiseToRupees(amountPaise)}
        </span>

        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-sm text-neutral-400">{t.confirm.partyLabel}</span>
          <span className="text-xl font-semibold text-neutral-900">{party.name}</span>
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-sm text-neutral-400">{t.confirm.directionLabel}</span>
          <span
            className={`text-lg font-bold ${isReceived ? "text-green-600" : "text-red-600"}`}
          >
            {isReceived ? t.direction.received : t.direction.paid}
          </span>
        </div>

        <label className="flex w-full flex-col items-center gap-1">
          <span className="text-sm text-neutral-400">{t.confirm.noteLabel}</span>
          <span className="flex min-h-[56px] w-full items-center gap-2 rounded-2xl border-2 border-neutral-200 px-4 focus-within:border-green-600">
            <PencilIcon className="h-6 w-6 shrink-0 text-neutral-400" />
            <input
              type="text"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={t.confirm.notePlaceholder}
              className="min-w-0 flex-1 bg-transparent text-lg focus:outline-none"
            />
          </span>
        </label>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="flex min-h-[64px] flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 text-lg font-bold text-white disabled:opacity-60 active:bg-red-700"
        >
          <CrossIcon className="h-7 w-7" />
          {t.common.cancel}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex min-h-[64px] flex-1 items-center justify-center gap-2 rounded-2xl bg-green-600 text-lg font-bold text-white disabled:opacity-60 active:bg-green-700"
        >
          <CheckIcon className="h-7 w-7" />
          {t.confirm.save}
        </button>
      </div>
    </div>
  );
}
