"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Eye, EyeOff, Lock, CheckCircle2, XCircle } from "lucide-react";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

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
        <CheckCircle2 className="w-12 h-12 text-emerald-500" />
        <h2 className="text-xl font-semibold text-white">Password atualizada!</h2>
        <p className="text-white/60 text-sm">A redirecionar para o dashboard…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full max-w-sm">
      <div className="text-center mb-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4">
          <Lock className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">Nova password</h1>
        <p className="text-white/60 text-sm mt-1">Escolhe uma password segura.</p>
      </div>

      <div className="relative">
        <input
          type={showPw ? "text" : "password"}
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Nova password (mín. 8 chars)"
          required
          className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/15 transition-all pr-12"
        />
        <button
          type="button"
          onClick={() => setShowPw(!showPw)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
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
        className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/15 transition-all"
      />

      {password && confirm && (
        <div className={`flex items-center gap-2 text-sm ${password === confirm ? "text-emerald-400" : "text-rose-400"}`}>
          {password === confirm
            ? <><CheckCircle2 className="w-4 h-4" /> Passwords coincidem</>
            : <><XCircle className="w-4 h-4" /> Passwords não coincidem</>
          }
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-500/20 border border-rose-500/30 px-4 py-3 text-rose-200 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || password !== confirm || !password}
        className="w-full py-3 rounded-2xl bg-white text-gray-900 font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {loading ? "A atualizar…" : "Atualizar password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950 p-4">
      <Suspense fallback={<div className="text-white/60 text-sm">A carregar…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
