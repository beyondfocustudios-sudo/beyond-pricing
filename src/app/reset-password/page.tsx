"use client";

// ============================================================
// /reset-password — Password Reset Flow
// ============================================================
// Two stages:
//   Stage 1 (no code in URL): user enters email → we call
//     resetPasswordForEmail which sends an email with a link
//     pointing to /auth/callback?type=recovery → /reset-password
//   Stage 2 (user arrives after clicking email link — Supabase
//     has already exchanged the code via /auth/callback):
//     user sets a new password → updateUser({password})
//
// Note: Supabase sets the session automatically when the user
// arrives at /auth/callback with type=recovery, so by the time
// they reach /reset-password the session is active and we can
// call updateUser directly.
// ============================================================

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react";
import { clearSessionCookieClient } from "@/lib/session";

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white inline-block"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

type Stage = "request" | "update" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect if user arrived after clicking the reset email link.
  // In that case, Supabase fires an AUTH_EVENT = PASSWORD_RECOVERY
  // and a session is established. We listen for it to switch to stage "update".
  useEffect(() => {
    const sb = createClient();
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStage("update");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Stage 1: request reset email ─────────────────────────────────────────
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    const sb = createClient();
    const origin = window.location.origin;
    const { error: resetErr } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?type=recovery`,
    });

    if (resetErr) {
      setError("Erro ao enviar email de recuperação. Verifica o endereço e tenta novamente.");
      setLoading(false);
      return;
    }

    setStage("done");
    setLoading(false);
  };

  // ── Stage 2: set new password ─────────────────────────────────────────────
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (password.length < 8) {
      setError("A password deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As passwords não coincidem.");
      return;
    }

    setError(null);
    setLoading(true);

    const sb = createClient();
    const { error: updateErr } = await sb.auth.updateUser({ password });

    if (updateErr) {
      setError("Erro ao atualizar password: " + updateErr.message);
      setLoading(false);
      return;
    }

    // Sign out so the user logs in fresh with the new password
    await sb.auth.signOut();
    clearSessionCookieClient();
    setStage("done");
    setLoading(false);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(40px)",
    WebkitBackdropFilter: "blur(40px)",
    boxShadow: "0 4px 40px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.6) inset",
    border: "1px solid rgba(255,255,255,0.6)",
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.04)",
    border: "1px solid rgba(0,0,0,0.1)",
    color: "#1d1d1f",
  };

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    background: disabled ? "#86868b" : "linear-gradient(135deg, #1a8fa3, #0d6b7e)",
    boxShadow: disabled ? "none" : "0 2px 12px rgba(26,143,163,0.35)",
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #f0f4ff 0%, #f5f5f7 50%, #f0f0ff 100%)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
            style={{ background: "linear-gradient(135deg, #1a8fa3, #0d6b7e)" }}
          >
            <span className="text-2xl font-bold text-white">B</span>
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "#1d1d1f" }}>
            Recuperar password
          </h1>
          <p className="text-sm mt-1" style={{ color: "#86868b" }}>
            Beyond Pricing
          </p>
        </div>

        <div className="rounded-2xl p-6" style={cardStyle}>
          <AnimatePresence mode="wait">

            {/* ── Stage 1: request email ──────────────────────────────── */}
            {stage === "request" && (
              <motion.form
                key="request"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleRequestReset}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold" style={{ color: "#1d1d1f" }}>
                    Recuperar acesso
                  </p>
                  <p className="text-xs" style={{ color: "#86868b" }}>
                    Introduz o teu email e enviamos um link de recuperação.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: "#1d1d1f" }}>
                    Email
                  </label>
                  <div className="relative">
                    <Mail
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                      style={{ color: "#86868b" }}
                    />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      placeholder="o.teu@email.com"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs overflow-hidden"
                      style={{ background: "#fef2f2", color: "#dc2626" }}
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
                  style={btnStyle(loading)}
                >
                  {loading ? <><Spinner /> A enviar…</> : "Enviar link de recuperação"}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="text-xs"
                    style={{ color: "#1a8fa3" }}
                  >
                    Voltar ao login
                  </button>
                </div>
              </motion.form>
            )}

            {/* ── Stage 2: set new password ───────────────────────────── */}
            {stage === "update" && (
              <motion.form
                key="update"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleUpdatePassword}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold" style={{ color: "#1d1d1f" }}>
                    Define uma nova password
                  </p>
                  <p className="text-xs" style={{ color: "#86868b" }}>
                    Escolhe uma password segura com pelo menos 8 caracteres.
                  </p>
                </div>

                {/* New password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: "#1d1d1f" }}>
                    Nova password
                  </label>
                  <div className="relative">
                    <Lock
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                      style={{ color: "#86868b" }}
                    />
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                      required
                      autoFocus
                      minLength={8}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm outline-none transition-all"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "#86868b" }}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: "#1d1d1f" }}>
                    Confirmar password
                  </label>
                  <div className="relative">
                    <Lock
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                      style={{ color: "#86868b" }}
                    />
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); if (error) setError(null); }}
                      required
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm outline-none transition-all"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "#86868b" }}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Password strength hint */}
                {password.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 flex-1">
                      {[8, 12, 16].map((threshold, i) => (
                        <div
                          key={i}
                          className="h-1 flex-1 rounded-full transition-all"
                          style={{
                            background:
                              password.length >= threshold
                                ? i === 0 ? "#f59e0b" : i === 1 ? "#10b981" : "#6366f1"
                                : "rgba(0,0,0,0.08)",
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-xs" style={{ color: "#86868b" }}>
                      {password.length < 8
                        ? "Fraca"
                        : password.length < 12
                          ? "Média"
                          : password.length < 16
                            ? "Boa"
                            : "Forte"}
                    </span>
                  </div>
                )}

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs overflow-hidden"
                      style={{ background: "#fef2f2", color: "#dc2626" }}
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={loading || password.length < 8 || password !== confirm}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
                  style={btnStyle(loading || password.length < 8 || password !== confirm)}
                >
                  {loading ? <><Spinner /> A guardar…</> : "Guardar nova password"}
                </button>
              </motion.form>
            )}

            {/* ── Stage done: success message ─────────────────────────── */}
            {stage === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="text-center py-4 space-y-3"
              >
                <div
                  className="h-14 w-14 rounded-full mx-auto flex items-center justify-center"
                  style={{ background: "#e8f8f2" }}
                >
                  <CheckCircle className="h-7 w-7" style={{ color: "#34d399" }} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold" style={{ color: "#1d1d1f" }}>
                    {stage === "done" && email && !password
                      ? "Email enviado!"
                      : "Password atualizada!"}
                  </p>
                  <p className="text-xs" style={{ color: "#86868b" }}>
                    {password
                      ? "A tua password foi alterada. Podes agora entrar com as novas credenciais."
                      : "Verifica a tua caixa de entrada para o link de recuperação."}
                  </p>
                </div>
                <button
                  onClick={() => router.push("/login")}
                  className="mt-2 text-sm font-semibold py-2.5 px-6 rounded-xl text-white transition-all"
                  style={btnStyle(false)}
                >
                  Ir para o login
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#86868b" }}>
          © {new Date().getFullYear()} Beyond Pricing
        </p>
      </motion.div>
    </div>
  );
}
