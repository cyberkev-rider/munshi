"use client";

/**
 * Voice capture flow — record a Hindi/Hinglish voice note, transcribe it
 * (Sarvam via /api/transcribe), extract a structured transaction from it
 * (Claude via /api/extract), then let the shopkeeper review/edit and save.
 *
 * One route, internal phase state machine (idle -> recording -> uploading ->
 * extracting -> confirm, with an error phase reachable from any network
 * step), mirroring src/app/new/page.tsx's one-screen-per-flow pattern rather
 * than a modal, so the hardware/gesture back button gets correct behavior for
 * free via real browser history.
 */

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import { useParties } from "@/lib/useParties";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";
import { createParty, createTransaction, deleteTransactionPermanently } from "@/lib/repo";
import { formatPaiseToRupees, parseAmountInputToPaise } from "@/lib/ledger";
import { computeFieldReviewFlags } from "@/lib/voice-confirm-helpers";
import { useSnackbar } from "@/components/Snackbar";
import { NumberPad } from "@/components/NumberPad";
import {
  BackIcon,
  CheckIcon,
  MicIcon,
  MoneyInIcon,
  MoneyOutIcon,
  PersonIcon,
  PlusIcon,
} from "@/components/icons";
import type { AiErrorBody, AiErrorCode } from "@/lib/ai-config";
import type { ExtractResult } from "@/lib/extract-helpers";
import type { TransactionDirection } from "@/lib/types";

type Phase = "idle" | "recording" | "uploading" | "extracting" | "confirm" | "error";
type ErrorReason = AiErrorCode | "permission-denied";

/** Converts integer paise back into a plain numeric string the amount editor
 * (a digit-string, per ledger.ts's parseAmountInputToPaise) can start from. */
function paiseToInputString(paise: number): string {
  const rupees = paise / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

export default function VoiceCapturePage() {
  const router = useRouter();
  const { t } = useI18n();
  const { show } = useSnackbar();
  const { parties, refresh: refreshParties } = useParties();

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [errorReason, setErrorReason] = useState<ErrorReason | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable confirm-screen state, seeded from extractResult once it arrives.
  const [partyQuery, setPartyQuery] = useState("");
  const [partyTouched, setPartyTouched] = useState(false);
  const [editingParty, setEditingParty] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);
  const [direction, setDirection] = useState<TransactionDirection>("paid");
  const [note, setNote] = useState("");

  const handleExtract = useCallback(
    async (transcriptText: string) => {
      setPhase("extracting");
      let res: Response;
      try {
        res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: transcriptText,
            existingPartyNames: parties.map((p) => p.name),
          }),
        });
      } catch {
        setErrorReason("upstream_error");
        setPhase("error");
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as AiErrorBody | null;
        setErrorReason(body?.error ?? "upstream_error");
        setPhase("error");
        return;
      }

      const data = (await res.json()) as ExtractResult;
      setExtractResult(data);
      setPartyQuery(data.party);
      setPartyTouched(false);
      setAmountInput(paiseToInputString(data.amount_paise));
      setAmountTouched(false);
      setDirection(data.direction);
      setNote(data.note);
      setPhase("confirm");
    },
    [parties]
  );

  const handleUpload = useCallback(
    async (blob: Blob) => {
      setPhase("uploading");
      const form = new FormData();
      form.append("audio", blob);

      let res: Response;
      try {
        res = await fetch("/api/transcribe", { method: "POST", body: form });
      } catch {
        setErrorReason("upstream_error");
        setPhase("error");
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as AiErrorBody | null;
        setErrorReason(body?.error ?? "upstream_error");
        setPhase("error");
        return;
      }

      const data = (await res.json()) as { transcript: string };
      setTranscript(data.transcript);
      await handleExtract(data.transcript);
    },
    [handleExtract]
  );

  const recorder = useVoiceRecorder(
    useMemo(
      () => ({
        onStopped: (blob: Blob) => {
          void handleUpload(blob);
        },
        onPermissionDenied: () => {
          setErrorReason("permission-denied");
          setPhase("error");
        },
        onError: () => {
          setErrorReason("invalid_audio");
          setPhase("error");
        },
      }),
      [handleUpload]
    )
  );

  const resetToIdle = useCallback(() => {
    if (recorder.state.status === "recording") recorder.cancel();
    recorder.reset();
    setPhase("idle");
    setTranscript(null);
    setExtractResult(null);
    setErrorReason(null);
    setPartyTouched(false);
    setEditingParty(false);
    setAmountTouched(false);
    setEditingAmount(false);
  }, [recorder]);

  function goBack() {
    if (phase === "idle") {
      router.back();
      return;
    }
    if (phase === "recording") {
      recorder.cancel();
      setPhase("idle");
      return;
    }
    resetToIdle();
  }

  const flags = useMemo(() => {
    if (!extractResult) return { party: false, amount: false };
    return computeFieldReviewFlags(extractResult, {
      partyEdited: partyTouched,
      amountEdited: amountTouched,
    });
  }, [extractResult, partyTouched, amountTouched]);

  const partySuggestions = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    const list = q ? parties.filter((p) => p.name.toLowerCase().includes(q)) : parties;
    return list.slice(0, 5);
  }, [parties, partyQuery]);

  const amountPaise = parseAmountInputToPaise(amountInput);
  const canSave = partyQuery.trim() !== "" && amountPaise > 0;

  async function handleSave() {
    if (!extractResult || !canSave) return;
    setSaving(true);
    try {
      const trimmedName = partyQuery.trim();
      let party = parties.find((p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase());
      if (!party) {
        party = await createParty({ name: trimmedName });
        await refreshParties();
      }
      const created = await createTransaction({
        party_id: party.id,
        amount_paise: amountPaise,
        direction,
        note: note.trim() || undefined,
        source: "voice",
        raw_text: transcript ?? undefined,
        confidence: extractResult.confidence,
      });
      show(t.snackbar.saved, {
        undoLabel: t.common.undo,
        onUndo: () => {
          deleteTransactionPermanently(created.id);
        },
      });
      router.push("/");
    } finally {
      setSaving(false);
    }
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
        <h1 className="text-lg font-bold text-neutral-800">
          {phase === "confirm" ? t.voice.confirmTitle : t.home.micHint}
        </h1>
      </header>

      {phase === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-4">
          <button
            type="button"
            onClick={() => {
              setPhase("recording");
              void recorder.start();
            }}
            aria-label={t.home.micHint}
            className="flex h-32 w-32 items-center justify-center rounded-full bg-green-600 text-white shadow-lg shadow-green-600/30 active:bg-green-700"
          >
            <MicIcon className="h-16 w-16" />
          </button>
          <p className="text-center text-sm text-neutral-500">{t.home.micHint}</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-4">
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/30">
            <MicIcon className="h-16 w-16 animate-pulse" />
          </div>
          <p className="text-center text-lg font-semibold text-neutral-700">
            {t.voice.recordingHint}
          </p>
          <div className="flex w-full flex-col gap-3">
            <button
              type="button"
              onClick={() => recorder.stop()}
              className="flex min-h-[64px] items-center justify-center rounded-2xl bg-neutral-900 text-lg font-bold text-white active:bg-neutral-800"
            >
              {t.voice.stop}
            </button>
            <button
              type="button"
              onClick={() => {
                recorder.cancel();
                setPhase("idle");
              }}
              className="flex min-h-[56px] items-center justify-center rounded-2xl text-base font-medium text-neutral-500 active:bg-neutral-100"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {(phase === "uploading" || phase === "extracting") && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-4">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-neutral-200 border-t-green-600" />
          <p className="text-center text-base font-medium text-neutral-600">
            {phase === "uploading" ? t.voice.uploading : t.voice.extracting}
          </p>
        </div>
      )}

      {phase === "error" && errorReason && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-4">
          <p className="text-center text-lg font-semibold text-red-600">
            {errorReason === "permission-denied"
              ? t.voice.micPermissionDenied
              : t.voice.errors[errorReason]}
          </p>
          <button
            type="button"
            onClick={resetToIdle}
            className="flex min-h-[56px] items-center justify-center rounded-2xl bg-neutral-900 px-6 text-base font-bold text-white active:bg-neutral-800"
          >
            {t.common.retry}
          </button>
        </div>
      )}

      {phase === "confirm" && extractResult && (
        <div className="flex flex-1 flex-col justify-between gap-4 px-4 pb-4">
          <div className="flex flex-col gap-4 overflow-y-auto">
            {transcript && (
              <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-400">
                {t.voice.youSaidLabel} <span className="italic">&ldquo;{transcript}&rdquo;</span>
              </p>
            )}

            {/* Party */}
            <div className="flex flex-col gap-2">
              {!editingParty ? (
                <button
                  type="button"
                  onClick={() => setEditingParty(true)}
                  className={`flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-4 text-left ${
                    flags.party ? "border-amber-400 bg-amber-50" : "border-neutral-200 bg-white"
                  }`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                    <PersonIcon className="h-6 w-6" />
                  </span>
                  <span className="flex-1 text-lg font-medium text-neutral-900">
                    {partyQuery || t.party.searchOrAddPlaceholder}
                  </span>
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={partyQuery}
                    onChange={(e) => {
                      setPartyQuery(e.target.value);
                      setPartyTouched(true);
                    }}
                    placeholder={t.party.searchOrAddPlaceholder}
                    className="min-h-[56px] w-full rounded-2xl border-2 border-neutral-200 px-4 text-lg focus:border-green-600 focus:outline-none"
                  />
                  <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {partySuggestions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPartyQuery(p.name);
                          setPartyTouched(true);
                          setEditingParty(false);
                        }}
                        className="flex min-h-[48px] items-center rounded-xl px-3 text-left text-base text-neutral-800 active:bg-neutral-100"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingParty(false)}
                    className="flex min-h-[48px] items-center justify-center rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-600 active:bg-neutral-200"
                  >
                    {t.amount.continue}
                  </button>
                </div>
              )}

              {flags.party && !editingParty && (
                <div className="flex flex-col gap-2 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-800">{t.voice.reviewBannerParty}</p>
                  <button
                    type="button"
                    onClick={() => setPartyTouched(true)}
                    className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-amber-600 text-sm font-bold text-white active:bg-amber-700"
                  >
                    <PlusIcon className="h-5 w-5" />
                    {t.voice.createPartyConfirm}: {partyQuery}
                  </button>
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="flex flex-col gap-2">
              {!editingAmount ? (
                <button
                  type="button"
                  onClick={() => setEditingAmount(true)}
                  className={`amount-numerals rounded-2xl border-2 px-4 py-4 text-center text-4xl font-extrabold ${
                    flags.amount ? "border-amber-400 text-amber-700" : "border-neutral-200 text-neutral-900"
                  }`}
                >
                  {formatPaiseToRupees(amountPaise)}
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <span className="amount-numerals text-center text-4xl font-extrabold text-neutral-900">
                    ₹{amountInput || "0"}
                  </span>
                  <NumberPad
                    onDigit={(digit) => {
                      setAmountTouched(true);
                      setAmountInput((prev) => {
                        if (prev.includes(".")) {
                          const [w, f = ""] = prev.split(".");
                          if (f.length >= 2) return prev;
                          return `${w}.${f}${digit}`;
                        }
                        if (prev === "0") return digit;
                        return prev + digit;
                      });
                    }}
                    onDecimalPoint={() => {
                      setAmountTouched(true);
                      setAmountInput((prev) => (prev.includes(".") ? prev : `${prev || "0"}.`));
                    }}
                    onBackspace={() => {
                      setAmountTouched(true);
                      setAmountInput((prev) => prev.slice(0, -1));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setEditingAmount(false)}
                    className="flex min-h-[48px] items-center justify-center rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-600 active:bg-neutral-200"
                  >
                    {t.amount.continue}
                  </button>
                </div>
              )}

              {flags.amount && extractResult.amountDisagreement && (
                <div className="flex flex-col gap-2 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-800">{t.voice.reviewBannerAmount}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAmountInput(
                          paiseToInputString(extractResult.amountDisagreement!.deterministicAmountPaise)
                        );
                        setAmountTouched(true);
                      }}
                      className="flex-1 rounded-xl bg-white px-3 py-2 text-left"
                    >
                      <span className="block text-xs text-neutral-400">{t.voice.weHeard}</span>
                      <span className="amount-numerals block text-lg font-bold text-neutral-900">
                        {formatPaiseToRupees(extractResult.amountDisagreement.deterministicAmountPaise)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAmountInput(paiseToInputString(extractResult.amountDisagreement!.llmAmountPaise));
                        setAmountTouched(true);
                      }}
                      className="flex-1 rounded-xl bg-white px-3 py-2 text-left"
                    >
                      <span className="block text-xs text-neutral-400">{t.voice.llmSaid}</span>
                      <span className="amount-numerals block text-lg font-bold text-neutral-900">
                        {formatPaiseToRupees(extractResult.amountDisagreement.llmAmountPaise)}
                      </span>
                    </button>
                  </div>
                </div>
              )}
              {flags.amount && !extractResult.amountDisagreement && (
                <p className="px-1 text-sm font-semibold text-amber-700">{t.voice.reviewBannerAmount}</p>
              )}
            </div>

            {/* Direction */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDirection("received")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 ${
                  direction === "received"
                    ? "bg-green-600 text-white"
                    : "border-2 border-green-600 text-green-600"
                }`}
              >
                <MoneyInIcon className="h-6 w-6" />
                <span className="text-base font-bold">{t.direction.received}</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection("paid")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 ${
                  direction === "paid" ? "bg-red-600 text-white" : "border-2 border-red-600 text-red-600"
                }`}
              >
                <MoneyOutIcon className="h-6 w-6" />
                <span className="text-base font-bold">{t.direction.paid}</span>
              </button>
            </div>

            {/* Note */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-neutral-400">{t.confirm.noteLabel}</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.confirm.notePlaceholder}
                className="min-h-[48px] w-full rounded-xl border border-neutral-200 px-3 text-base focus:border-green-600 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave}
            className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-lg font-bold text-white disabled:opacity-60 active:bg-neutral-800"
          >
            <CheckIcon className="h-6 w-6" />
            {t.confirm.save}
          </button>
        </div>
      )}
    </div>
  );
}
