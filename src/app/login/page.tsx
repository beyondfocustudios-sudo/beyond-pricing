"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { setSessionCookieClient, SESSION_TTL } from "@/lib/session";
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, CheckCircle,
  AlertCircle, Zap, Hash, RefreshCw,
} from "lucide-react";

// ── Spinner ───────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Google icon ───────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

// ── Microsoft icon ────────────────────────────────────────────
function MicrosoftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
    </svg>
  );
}

type AuthTab = "password" | "otp";

const OTP_COOLDOWN = 30; // seconds

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get("expired") === "1";

  const [tab, setTab] = useState<AuthTab>("password");

  // Password form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");

  // OTP form
  const [otpEmail, setOtpEmail] = useState("");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // OAuth loading
  const [oauthLoading, setOauthLoading] = useState<"google" | "microsoft" | null>(null);

  // Cleanup cooldown on unmount
  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  const startCooldown = () => {
    setOtpCooldown(OTP_COOLDOWN);
    cooldownRef.current = setInterval(() => {
      setOtpCooldown((c) => {
        if (c <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  // ── Password Login ───────────────────────────────────────────
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwLoading) return;
    setPwError("");
    setPwLoading(true);

    try {
      const sb = createClient();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        setPwError("Email ou password incorretos. Verifica os teus dados.");
        return;
      }
      const ttl = rememberMe ? SESSION_TTL.LONG : SESSION_TTL.DAY;
      setSessionCookieClient(ttl);
      router.push("/app");
      router.refresh();
    } catch {
      setPwError("Erro inesperado. Tenta novamente.");
    } finally {
      setPwLoading(false);
    }
  };

  // ── OTP — Step 1: Send code ──────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpLoading || otpCooldown > 0) return;
    setOtpError("");
    setOtpLoading(true);

    try {
      const sb = createClient();
      const { error } = await sb.auth.signInWithOtp({
        email: otpEmail,
        options: { shouldCreateUser: false },
      });
      if (error) {
        setOtpError(error.message);
        return;
      }
      setOtpStep("code");
      startCooldown();
    } catch {
      setOtpError("Erro ao enviar código. Tenta novamente.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ── OTP — Step 2: Verify code ────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpLoading) return;
    setOtpError("");
    setOtpLoading(true);

    try {
      const sb = createClient();
      const { error } = await sb.auth.verifyOtp({
        email: otpEmail,
        token: otpCode.trim(),
        type: "email",
      });
      if (error) {
        setOtpError("Código inválido ou expirado. Solicita um novo código.");
        return;
      }
      // OTP sessions: SHORT TTL (1 hour)
      setSessionCookieClient(SESSION_TTL.SHORT);
      router.push("/app");
      router.refresh();
    } catch {
      setOtpError("Erro ao verificar código. Tenta novamente.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Resend OTP ───────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (otpCooldown > 0) return;
    setOtpError("");
    setOtpLoading(true);
    try {
      const sb = createClient();
      await sb.auth.signInWithOtp({
        email: otpEmail,
        options: { shouldCreateUser: false },
      });
      startCooldown();
    } catch { /* ignore */ }
    setOtpLoading(false);
  };

  // ── OAuth ────────────────────────────────────────────────────
  const handleOAuth = async (provider: "google" | "azure") => {
    setOauthLoading(provider === "azure" ? "microsoft" : "google");
    const sb = createClient();
    await sb.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?ttl=${rememberMe ? "30d" : "24h"}`,
      },
    });
  };

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(26,143,163,0.12) 0%, transparent 60%)",
        }}
      />
      {/* Grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
            style={{ background: "var(--accent)", boxShadow: "0 0 40px var(--accent-glow), 0 8px 32px rgba(0,0,0,0.4)" }}
          >
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text)", letterSpacing: "-0.03em" }}>
            Beyond Pricing
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            Plataforma de produção audiovisual
          </p>
        </div>

        {/* Expired session banner */}
        {expired && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="alert alert-error mb-4"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">Sessão expirada. Volta a entrar.</span>
          </motion.div>
        )}

        {/* Card */}
        <div
          className="card-glass p-6"
          style={{
            background: "rgba(13,17,27,0.8)",
            border: "1px solid var(--border-2)",
            borderRadius: "var(--r-xl)",
            boxShadow: "var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* Tab switcher */}
          <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: "var(--surface-2)" }}>
            {(["password", "otp"] as AuthTab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setPwError(""); setOtpError(""); }}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: tab === t ? "var(--surface-3)" : "transparent",
                  color: tab === t ? "var(--text)" : "var(--text-3)",
                }}
              >
                {t === "password" ? "Password" : "Código (OTP)"}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ── PASSWORD TAB ─────────────────────────────── */}
            {tab === "password" && (
              <motion.div
                key="password"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.2 }}
              >
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="label">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "var(--text-3)" }} />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@beyondfocus.pt"
                        className="input"
                        style={{ paddingLeft: "2.5rem" }}
                        autoComplete="email"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="label" style={{ margin: 0 }}>Password</label>
                      <a href="/reset-password" className="text-xs" style={{ color: "var(--accent-2)" }}>
                        Esqueci a password
                      </a>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "var(--text-3)" }} />
                      <input
                        type={showPw ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="input"
                        style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw(!showPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--text-3)" }}
                      >
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember me */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <div
                      className="relative h-4 w-4 rounded flex items-center justify-center border transition-colors shrink-0"
                      style={{
                        background: rememberMe ? "var(--accent)" : "transparent",
                        borderColor: rememberMe ? "var(--accent)" : "var(--border-2)",
                      }}
                      onClick={() => setRememberMe(!rememberMe)}
                    >
                      {rememberMe && <CheckCircle className="h-3 w-3 text-white" />}
                    </div>
                    <span className="text-xs" style={{ color: "var(--text-2)" }}>
                      Manter sessão por 30 dias
                    </span>
                  </label>

                  {/* Error */}
                  <AnimatePresence>
                    {pwError && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="alert alert-error"
                      >
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{pwError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={pwLoading || !email || !password}
                    className="btn btn-primary btn-lg w-full"
                  >
                    {pwLoading ? <><Spinner /> A entrar…</> : <>Entrar <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </form>

                {/* Divider */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" style={{ borderColor: "var(--border)" }} />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-2 text-xs" style={{ background: "rgba(13,17,27,0.8)", color: "var(--text-3)" }}>
                      ou continua com
                    </span>
                  </div>
                </div>

                {/* OAuth buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={oauthLoading !== null}
                    onClick={() => handleOAuth("google")}
                    className="btn btn-secondary flex items-center justify-center gap-2 text-xs"
                  >
                    {oauthLoading === "google" ? <Spinner /> : <GoogleIcon />}
                    Google
                  </button>
                  <button
                    type="button"
                    disabled={oauthLoading !== null}
                    onClick={() => handleOAuth("azure")}
                    className="btn btn-secondary flex items-center justify-center gap-2 text-xs"
                  >
                    {oauthLoading === "microsoft" ? <Spinner /> : <MicrosoftIcon />}
                    Microsoft
                  </button>
                </div>

                <p className="text-xs text-center mt-3" style={{ color: "var(--text-3)" }}>
                  OAuth: sessão 24h (ou 30 dias com &ldquo;manter sessão&rdquo; activo)
                </p>
              </motion.div>
            )}

            {/* ── OTP TAB ───────────────────────────────────── */}
            {tab === "otp" && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <AnimatePresence mode="wait">
                  {otpStep === "email" ? (
                    <motion.form
                      key="otp-email"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onSubmit={handleSendOtp}
                      className="space-y-4"
                    >
                      <div>
                        <p className="text-sm font-medium mb-0.5" style={{ color: "var(--text)" }}>
                          Entrar com código por email
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>
                          Enviamos um código de 6 dígitos. Sessão de 1 hora.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="label">Email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "var(--text-3)" }} />
                          <input
                            type="email"
                            required
                            value={otpEmail}
                            onChange={(e) => setOtpEmail(e.target.value)}
                            placeholder="tu@beyondfocus.pt"
                            className="input"
                            style={{ paddingLeft: "2.5rem" }}
                            autoComplete="email"
                            autoFocus
                          />
                        </div>
                      </div>

                      <AnimatePresence>
                        {otpError && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="alert alert-error">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span className="text-sm">{otpError}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <button
                        type="submit"
                        disabled={otpLoading || !otpEmail || otpCooldown > 0}
                        className="btn btn-primary btn-lg w-full"
                      >
                        {otpLoading ? <><Spinner /> A enviar…</> : <>Enviar código <ArrowRight className="h-4 w-4" /></>}
                      </button>
                    </motion.form>
                  ) : (
                    <motion.form
                      key="otp-code"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onSubmit={handleVerifyOtp}
                      className="space-y-4"
                    >
                      <div>
                        <p className="text-sm font-medium mb-0.5" style={{ color: "var(--text)" }}>
                          Código enviado!
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>
                          Verifica o email <span className="font-medium" style={{ color: "var(--text-2)" }}>{otpEmail}</span>
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="label">Código de 6 dígitos</label>
                        <div className="relative">
                          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "var(--text-3)" }} />
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            required
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="123456"
                            className="input text-center tracking-[0.5em] font-mono"
                            style={{ paddingLeft: "2.5rem", fontSize: "1.25rem" }}
                            autoFocus
                            autoComplete="one-time-code"
                          />
                        </div>
                      </div>

                      <AnimatePresence>
                        {otpError && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="alert alert-error">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span className="text-sm">{otpError}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <button
                        type="submit"
                        disabled={otpLoading || otpCode.length < 6}
                        className="btn btn-primary btn-lg w-full"
                      >
                        {otpLoading ? <><Spinner /> A verificar…</> : <>Verificar código <ArrowRight className="h-4 w-4" /></>}
                      </button>

                      <div className="flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => { setOtpStep("email"); setOtpCode(""); setOtpError(""); }}
                          style={{ color: "var(--text-3)" }}
                        >
                          ← Mudar email
                        </button>
                        <button
                          type="button"
                          onClick={handleResendOtp}
                          disabled={otpCooldown > 0 || otpLoading}
                          className="flex items-center gap-1"
                          style={{ color: otpCooldown > 0 ? "var(--text-3)" : "var(--accent-2)" }}
                        >
                          <RefreshCw className="h-3 w-3" />
                          {otpCooldown > 0 ? `Reenviar (${otpCooldown}s)` : "Reenviar código"}
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs mt-5" style={{ color: "var(--text-3)" }}>
          {tab === "password"
            ? "Sem conta? Contacta a tua equipa Beyond."
            : "Código de uso único. Sessão expira em 1 hora."}
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
