"use client";

import { createContext, useContext, useState, useCallback, useRef, useMemo } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

// ── Types ────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

// ── Context ──────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ── Config ───────────────────────────────────────────────────
const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#22c55e" }} />,
  error: <XCircle className="h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />,
  info: <Info className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />,
};

const BORDER: Record<ToastType, string> = {
  success: "rgba(34,197,94,0.3)",
  error: "rgba(239,68,68,0.3)",
  info: "rgba(26,143,163,0.3)",
};

const AUTO_DISMISS = 3500;

// ── Provider ─────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
    timers.current[id] = setTimeout(() => dismiss(id), AUTO_DISMISS);
  }, [dismiss]);

  const ctx: ToastContextValue = useMemo(
    () => ({
      success: (msg) => push("success", msg),
      error: (msg) => push("error", msg),
      info: (msg) => push("info", msg),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={ctx}>
      {children}

      {/* Toast portal — fixed bottom-right */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none"
        style={{ maxWidth: "min(380px, calc(100vw - 2rem))" }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg animate-toast-in"
            style={{
              background: "var(--surface-3)",
              border: `1px solid ${BORDER[t.type]}`,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              color: "var(--text)",
              minWidth: "240px",
            }}
          >
            {ICONS[t.type]}
            <p className="flex-1 leading-snug" style={{ color: "var(--text)" }}>{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 mt-0.5 opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-toast-in { animation: toast-in 0.18s ease-out forwards; }
      `}</style>
    </ToastContext.Provider>
  );
}
