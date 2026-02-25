"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Mail, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { SESSION_TTL, setSessionCookieClient } from "@/lib/session";
import { buttonMotionProps, transitions, useMotionEnabled, variants } from "@/lib/motion";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { audienceLabel, audienceLoginPath, parseAudience } from "@/lib/login-audience";

const OTP_COOLDOWN = 30;

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4z" />
    </svg>
  );
}

function PortalLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const motionEnabled = useMotionEnabled();
  const expired = searchParams.get("expired") === "1";
  const mode = parseAudience(searchParams.get("mode") ?? searchParams.get("role")) ?? "client";
  const mismatch = searchParams.get("mismatch") === "1";

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (mode === "team") {
      router.replace(audienceLoginPath("team"));
    }
  }, [mode, router]);

  const startCooldown = () => {
    setCooldown(OTP_COOLDOWN);
    timerRef.current = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  const sendOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setGatewayError(null);
    setLoading(true);

    try {
      const sb = createClient();
      const { error: otpError } = await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });

      if (otpError) {
        setError("Não foi possível enviar o código. Confirma o email com a equipa.");
        return;
      }

      setStep("otp");
      setOtp("");
      startCooldown();
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading || otp.length !== 6) return;
    setError(null);
    setGatewayError(null);
    setLoading(true);

    try {
      const sb = createClient();
      const { error: verifyError } = await sb.auth.verifyOtp({
        email,
        token: otp.trim(),
        type: "email",
      });

      if (verifyError) {
        setError("Código inválido ou expirado.");
        return;
      }

      const audienceRes = await fetch(`/api/auth/validate-audience?audience=${mode}`, { cache: "no-store" });
      if (!audienceRes.ok) {
        const payload = await audienceRes.json().catch(() => ({} as { message?: string; suggestedPath?: string }));
        await sb.auth.signOut();
        const suggestedPath = typeof payload.suggestedPath === "string"
          ? payload.suggestedPath
          : audienceLoginPath(mode);
        setGatewayError(payload.message ?? `Esta conta não pertence a ${audienceLabel(mode)}.`);
        router.replace(suggestedPath.includes("?") ? `${suggestedPath}&mismatch=1` : `${suggestedPath}?mismatch=1`);
        return;
      }

      setSessionCookieClient(SESSION_TTL.SHORT);
      router.push("/portal");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (loading || cooldown > 0) return;
    setError(null);
    setGatewayError(null);
    setLoading(true);
    try {
      const sb = createClient();
      const { error: resendError } = await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (resendError) {
        setError("Falha ao reenviar código.");
        return;
      }
      setOtp("");
      startCooldown();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="super-theme super-shell-bg h-dvh overflow-y-auto px-4 py-5 md:p-8">
      <motion.div
        initial={motionEnabled ? "initial" : false}
        animate={motionEnabled ? "animate" : undefined}
        variants={variants.page}
        transition={transitions.page}
        className="mx-auto w-full max-w-[980px]"
      >
        <section className="card-glass overflow-hidden rounded-[32px] border" style={{ borderColor: "var(--border-soft)" }}>
          <div className="grid min-h-[620px] md:grid-cols-[1fr_1fr]">
            <aside className="relative hidden border-r p-9 md:block" style={{ borderColor: "var(--border)" }}>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(48rem 30rem at 20% 12%, rgba(26,143,163,0.24), transparent 58%), radial-gradient(42rem 24rem at 82% 86%, rgba(244,223,125,0.2), transparent 55%)",
                }}
              />
              <div className="relative z-10">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "var(--accent-primary)", color: "#fff" }}>
                  <Zap className="h-4 w-4" />
                </div>
                <h1 className="mt-5 text-[2rem] font-[560] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                  Portal Cliente
                </h1>
                <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>
                  Acesso OTP-only para acompanhar entregas, mensagens e aprovações.
                </p>
                <div className="mt-7 pill inline-flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Sessão curta e segura (1h)
                </div>
              </div>
            </aside>

            <div className="p-6 sm:p-8 md:p-9">
              <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>
                {audienceLabel(mode)}
              </p>
              <h2 className="mt-1.5 text-[1.75rem] font-[560] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                Entrar com código
              </h2>

              {expired ? (
                <div className="alert alert-error mt-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">Sessão expirada. Faz login novamente.</span>
                </div>
              ) : null}

              {mismatch ? (
                <div className="alert alert-error mt-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">Conta sem permissão para este acesso.</span>
                </div>
              ) : null}

              {gatewayError ? (
                <div className="alert alert-error mt-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">{gatewayError}</span>
                </div>
              ) : null}

              <AnimatePresence mode="wait">
                {step === "email" ? (
                  <motion.form
                    key="portal-email"
                    className="mt-6 space-y-4"
                    onSubmit={sendOtp}
                    initial={motionEnabled ? "initial" : false}
                    animate={motionEnabled ? "animate" : undefined}
                    exit={motionEnabled ? "exit" : undefined}
                    variants={variants.tab}
                    transition={transitions.page}
                  >
                    <div className="space-y-1.5">
                      <label className="label">Email</label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
                        <input
                          type="email"
                          required
                          autoFocus
                          className="input w-full pl-9"
                          placeholder="o.teu@email.com"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                        />
                      </div>
                    </div>

                    {error ? (
                      <div className="alert alert-error">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{error}</span>
                      </div>
                    ) : null}

                    <motion.button
                      type="submit"
                      disabled={loading || !email}
                      className="btn btn-primary btn-lg w-full"
                      {...buttonMotionProps({ enabled: motionEnabled })}
                    >
                      {loading ? <><Spinner /> A enviar…</> : <>Enviar código <ArrowRight className="h-4 w-4" /></>}
                    </motion.button>
                  </motion.form>
                ) : null}

                {step === "otp" ? (
                  <motion.form
                    key="portal-otp"
                    className="mt-6 space-y-4"
                    onSubmit={verifyOtp}
                    initial={motionEnabled ? "initial" : false}
                    animate={motionEnabled ? "animate" : undefined}
                    exit={motionEnabled ? "exit" : undefined}
                    variants={variants.tab}
                    transition={transitions.page}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        className="mt-0.5 text-[var(--text-3)]"
                        onClick={() => {
                          setStep("email");
                          setOtp("");
                          setError(null);
                        }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                          Código enviado para {email}
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>
                          Introduz os 6 dígitos para continuar.
                        </p>
                      </div>
                    </div>

                    <OtpCodeInput
                      value={otp}
                      onChange={(next) => setOtp(next.replace(/\D/g, "").slice(0, 6))}
                      autoFocus
                      disabled={loading}
                    />

                    {error ? (
                      <div className="alert alert-error">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{error}</span>
                      </div>
                    ) : null}

                    <motion.button
                      type="submit"
                      disabled={loading || otp.length !== 6}
                      className="btn btn-primary btn-lg w-full"
                      {...buttonMotionProps({ enabled: motionEnabled })}
                    >
                      {loading ? <><Spinner /> A validar…</> : <>Entrar <CheckCircle2 className="h-4 w-4" /></>}
                    </motion.button>

                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs"
                      onClick={resendOtp}
                      disabled={loading || cooldown > 0}
                      style={{ color: cooldown > 0 ? "var(--text-3)" : "var(--accent-2)" }}
                    >
                      <RefreshCw className="h-3 w-3" />
                      {cooldown > 0 ? `Reenviar (${cooldown}s)` : "Reenviar código"}
                    </button>
                  </motion.form>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </motion.div>
    </div>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense>
      <PortalLoginInner />
    </Suspense>
  );
}
