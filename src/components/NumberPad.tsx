"use client";

import { BackspaceIcon } from "./icons";

interface NumberPadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onDecimalPoint: () => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

/** Large custom number pad — no native <input type="number">, per spec, so
 * every key is a big thumb-friendly tap target and the amount display can
 * be styled huge and centrally. */
export function NumberPad({ onDigit, onBackspace, onDecimalPoint }: NumberPadProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((key) => {
        if (key === "back") {
          return (
            <button
              key={key}
              type="button"
              onClick={onBackspace}
              aria-label="Backspace"
              className="flex min-h-[64px] items-center justify-center rounded-2xl bg-neutral-100 text-neutral-600 active:bg-neutral-200"
            >
              <BackspaceIcon className="h-7 w-7" />
            </button>
          );
        }
        if (key === ".") {
          return (
            <button
              key={key}
              type="button"
              onClick={onDecimalPoint}
              aria-label="Decimal point"
              className="flex min-h-[64px] items-center justify-center rounded-2xl bg-neutral-100 text-2xl font-bold text-neutral-600 active:bg-neutral-200"
            >
              .
            </button>
          );
        }
        return (
          <button
            key={key}
            type="button"
            onClick={() => onDigit(key)}
            className="amount-numerals flex min-h-[64px] items-center justify-center rounded-2xl bg-neutral-100 text-2xl font-bold text-neutral-900 active:bg-neutral-200"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
