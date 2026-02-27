"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Eye, EyeOff, Lock, CheckCircle2, XCircle } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";

function ResetPasswordForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supabase sends #access_token=...&type=recovery in the URL fragment
  useEffect(() => {
    // The SSR client will pick up the session from the URL hash automatically
    // via the auth callback. If we're here, user is authenticated via recovery token.
    const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));
    const type = hashParams.get("type");
    if (type === "recovery") {
      // Session is valid - user can reset password
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A password deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As passwords não coincidem.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.replace("/app"), 2500);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle2 className="w-12 h-12" style={{ color: "var(--success)" }} />
        <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Password atualizada!</h2>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>A redirecionar para o dashboard…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full">
      <div className="text-center mb-2">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <Lock className="w-7 h-7" style={{ color: "var(--text)" }} />
        </div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Nova password</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>Escolhe uma password segura.</p>
      </div>

      <div className="relative">
        <input
          type={showPw ? "text" : "password"}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Nova password (mín. 8 chars)"
          required
          className="input w-full pr-12"
        />
        <button
          type="button"
          onClick={() => setShowPw(!showPw)}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: "var(--text-3)" }}
        >
          {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>

      <input
        type={showPw ? "text" : "password"}
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        placeholder="Confirmar password"
        required
        className="input w-full"
      />

      {password && confirm && (
        <div
          className="flex items-center gap-2 text-sm"
          style={{ color: password === confirm ? "var(--success)" : "var(--error)" }}
        >
          {password === confirm
            ? <><CheckCircle2 className="w-4 h-4" /> Passwords coincidem</>
            : <><XCircle className="w-4 h-4" /> Passwords não coincidem</>
          }
        </div>
      )}

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--error-bg)", border: "1px solid var(--error-border)", color: "var(--error)" }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || password !== confirm || !password}
        className="btn btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "A atualizar…" : "Atualizar password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell maxWidth={560}>
      <div className="card-glass rounded-[28px] border p-6 md:p-8" style={{ borderColor: "var(--border-soft)" }}>
        <Suspense fallback={<div className="text-sm" style={{ color: "var(--text-2)" }}>A carregar…</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </AuthShell>
  );
}
