"use client";

/**
 * A single global snackbar with an optional "undo" action. Lives at the app
 * root (via SnackbarProvider in layout.tsx) so it survives client-side
 * navigation — e.g. save an entry, get bounced back to Home, and the "undo"
 * snackbar is still there and still works.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface SnackbarState {
  message: string;
  undoLabel?: string;
  onUndo?: () => void;
  key: number;
}

interface SnackbarContextValue {
  show: (message: string, options?: { undoLabel?: string; onUndo?: () => void }) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SnackbarState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(0);

  const dismiss = useCallback(() => {
    setState(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (message: string, options?: { undoLabel?: string; onUndo?: () => void }) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      keyRef.current += 1;
      setState({
        message,
        undoLabel: options?.undoLabel,
        onUndo: options?.onUndo,
        key: keyRef.current,
      });
      timerRef.current = setTimeout(() => {
        setState(null);
      }, AUTO_DISMISS_MS);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const value = useMemo<SnackbarContextValue>(() => ({ show }), [show]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {state && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
        >
          <div
            key={state.key}
            className="flex w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-neutral-900 px-5 py-4 text-white shadow-lg"
          >
            <span className="text-base font-medium">{state.message}</span>
            {state.onUndo && (
              <button
                type="button"
                onClick={() => {
                  state.onUndo?.();
                  dismiss();
                }}
                className="min-h-[44px] shrink-0 rounded-xl bg-white/15 px-4 py-2 text-base font-bold text-amber-300 active:bg-white/25"
              >
                {state.undoLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) {
    throw new Error("useSnackbar must be used within a SnackbarProvider");
  }
  return ctx;
}
