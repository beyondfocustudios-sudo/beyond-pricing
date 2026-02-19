"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, AlertCircle, CheckCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { setSessionCookieClient, SESSION_TTL } from "@/lib/session";

// ── Spinner ──────────────────────────────────────────────────────────────────
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

const RESEND_COOLDOWN = 30; // seconds

function PortalLoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isExpired = searchParams.get("expired") === "1";

  // ── step: "email" | "otp" ─────────────────────────────────────────────────
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // cleanup timer on unmount
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function startCooldown() {
    setCountdown(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  // ── Step 1: send OTP ──────────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    const sb = createClient();
    const { error: otpErr } = await sb.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, // portal clients must already exist
      },
    });

    if (otpErr) {
      // "Email not confirmed" or similar → user not found
      const msg =
        otpErr.message.toLowerCase().includes("not found") ||
        otpErr.message.toLowerCase().includes("email")
          ? "Não encontrámos este email. Contacta o teu gestor de projeto."
          : "Erro ao enviar código. Tenta novamente.";
      setError(msg);
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep("otp");
    startCooldown();
  };

  // ── Step 2: verify OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const code = otp.trim();
    if (code.length !== 6) {
      setError("O código deve ter 6 dígitos.");
      return;
    }
    setError(null);
    setLoading(true);

    const sb = createClient();
    const { error: verifyErr } = await sb.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (verifyErr) {
      setError("Código inválido ou expirado. Solicita um novo código.");
      setLoading(false);
      return;
    }

    // Portal always uses SHORT TTL (1 hour) — no remember me option
    setSessionCookieClient(SESSION_TTL.SHORT);
    router.push("/portal");
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (countdown > 0 || loading) return;
    setError(null);
    setOtp("");
    setLoading(true);

    const sb = createClient();
    await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    setLoading(false);
    startCooldown();
  };

  // ── Shared card styles ────────────────────────────────────────────────────
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
        background: "linear-gradient(135deg, #e8f4f6 0%, #f5f5f7 50%, #e8f0f6 100%)",
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
            Portal do Cliente
          </h1>
          <p className="text-sm mt-1" style={{ color: "#86868b" }}>
            Beyond Focus Studios
          </p>
        </div>

        {/* Expired session banner */}
        <AnimatePresence>
          {isExpired && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs mb-4"
              style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              A tua sessão expirou. Por favor autentica-te novamente.
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card */}
        <div className="rounded-2xl p-6" style={cardStyle}>
          <AnimatePresence mode="wait">
            {/* ── Step 1: Email ─────────────────────────────────────────── */}
            {step === "email" && (
              <motion.form
                key="email-step"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleSendOtp}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold" style={{ color: "#1d1d1f" }}>
                    Acesso seguro por código
                  </p>
                  <p className="text-xs" style={{ color: "#86868b" }}>
                    Introduz o teu email e enviamos um código de 6 dígitos.
                  </p>
                </div>

                {/* Email input */}
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

                {/* Error */}
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
                  {loading ? <><Spinner /> A enviar…</> : "Enviar código"}
                </button>
              </motion.form>
            )}

            {/* ── Step 2: OTP code ──────────────────────────────────────── */}
            {step === "otp" && (
              <motion.form
                key="otp-step"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleVerifyOtp}
                className="space-y-4"
              >
                {/* Back button + heading */}
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => { setStep("email"); setError(null); setOtp(""); }}
                    className="mt-0.5 p-1 rounded-lg transition-all"
                    style={{ color: "#86868b" }}
                    aria-label="Voltar"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" style={{ color: "#34d399" }} />
                      <p className="text-sm font-semibold" style={{ color: "#1d1d1f" }}>
                        Código enviado!
                      </p>
                    </div>
                    <p className="text-xs" style={{ color: "#86868b" }}>
                      Introduz o código de 6 dígitos enviado para{" "}
                      <span className="font-medium" style={{ color: "#1d1d1f" }}>{email}</span>
                    </p>
                  </div>
                </div>

                {/* OTP input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: "#1d1d1f" }}>
                    Código de verificação
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setOtp(v);
                      if (error) setError(null);
                    }}
                    required
                    autoFocus
                    placeholder="123456"
                    className="w-full py-3 rounded-xl text-center text-2xl font-bold tracking-[0.5em] outline-none transition-all"
                    style={{
                      ...inputStyle,
                      letterSpacing: "0.5em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  />
                </div>

                {/* Error */}
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
                  disabled={loading || otp.length !== 6}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2"
                  style={btnStyle(loading || otp.length !== 6)}
                >
                  {loading ? <><Spinner /> A verificar…</> : "Verificar código"}
                </button>

                {/* Resend */}
                <div className="flex items-center justify-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={countdown > 0 || loading}
                    className="flex items-center gap-1 font-medium transition-all"
                    style={{
                      color: countdown > 0 || loading ? "#86868b" : "#1a8fa3",
                      cursor: countdown > 0 || loading ? "not-allowed" : "pointer",
                    }}
                  >
                    <RefreshCw className="h-3 w-3" />
                    {countdown > 0 ? `Reenviar em ${countdown}s` : "Reenviar código"}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* Footer note about session duration */}
        <p className="text-center text-xs mt-4" style={{ color: "#86868b" }}>
          Sessão válida por 1 hora após autenticação
        </p>
        <p className="text-center text-xs mt-2" style={{ color: "#86868b" }}>
          © {new Date().getFullYear()} Beyond Focus Studios
        </p>
      </motion.div>
    </div>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense>
      <PortalLoginPageInner />
    </Suspense>
  );
}
