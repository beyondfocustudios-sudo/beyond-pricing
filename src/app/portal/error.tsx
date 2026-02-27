"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Portal Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4 py-8" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "rgba(239, 68, 68, 0.1)", color: "rgb(239, 68, 68)" }}>
            <AlertTriangle className="h-8 w-8" />
          </div>

          <div className="space-y-2 text-center">
            <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
              Algo correu mal
            </h1>
            <p className="text-sm" style={{ color: "var(--text-2)" }}>
              Ocorreu um erro ao carregar esta página. Tente recarregar ou volte mais tarde.
            </p>
          </div>
        </div>

        {error.message && (
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.02)" }}>
            <p className="font-mono text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:bg-opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            <RotateCcw className="h-4 w-4" />
            Tentar novamente
          </button>

          <a
            href="/portal"
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition"
            style={{ background: "var(--accent-primary)", color: "#fff" }}
          >
            Voltar ao dashboard
          </a>
        </div>

        {error.digest && (
          <p className="text-center text-xs" style={{ color: "var(--text-3)" }}>
            ID do erro: <code className="font-mono">{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  );
}
