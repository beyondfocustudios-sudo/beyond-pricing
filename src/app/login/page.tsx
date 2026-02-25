"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { SESSION_TTL, setSessionCookieClient } from "@/lib/session";
import { buttonMotionProps, transitions, useMotionEnabled, variants } from "@/lib/motion";
import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { audienceLabel, audienceLoginPath, parseAudience, type LoginAudience } from "@/lib/login-audience";
import { AuthShell } from "@/components/layout/AuthShell";

type AuthTab = "password" | "otp" | "oauth";

const OTP_COOLDOWN = 30;

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

async function validateAudienceAccess(audience: LoginAudience) {
  const response = await fetch(`/api/auth/validate-audience?audience=${audience}`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({} as { message?: string; suggestedPath?: string; redirectPath?: string }));

  if (response.ok) {
    return {
      ok: true as const,
      suggestedPath: payload.redirectPath ?? "/app/dashboard",
    };
  }

  return {
    ok: false as const,
    message: payload.message ?? `A conta não pertence a ${audienceLabel(audience)}.`,
    suggestedPath: payload.suggestedPath ?? audienceLoginPath(audience),
  };
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const motionEnabled = useMotionEnabled();
  const expired = searchParams.get("expired") === "1";
  const selectedAudience = parseAudience(searchParams.get("mode") ?? searchParams.get("role")) ?? "team";
  const expectedAudience = parseAudience(searchParams.get("expected"));
  const mismatch = searchParams.get("mismatch") === "1";

  const [tab, setTab] = useState<AuthTab>("password");
  const [rememberMe, setRememberMe] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");

  const [otpEmail, setOtpEmail] = useState("");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [oauthLoading, setOauthLoading] = useState<"google" | "microsoft" | null>(null);
  const [oauthError, setOauthError] = useState("");
  const [gatewayError, setGatewayError] = useState("");

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  useEffect(() => {
    if (selectedAudience === "collaborator") {
      router.replace("/login?mode=team");
    }
  }, [router, selectedAudience]);

  useEffect(() => {
    if (selectedAudience === "client") {
      router.replace("/portal/login?mode=client");
    }
  }, [router, selectedAudience]);

  const passwordStrength = useMemo(() => {
    const score = Number(password.length >= 8) + Number(/[A-Z]/.test(password)) + Number(/\d/.test(password));
    if (!password) return { label: "Sem password", tone: "var(--text-3)" };
    if (score <= 1) return { label: "Fraca", tone: "var(--error)" };
    if (score === 2) return { label: "Média", tone: "var(--warning)" };
    return { label: "Forte", tone: "var(--success)" };
  }, [password]);

  const startCooldown = () => {
    setOtpCooldown(OTP_COOLDOWN);
    cooldownRef.current = setInterval(() => {
      setOtpCooldown((current) => {
        if (current <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  const completeLogin = async (ttlSeconds: number, audience: LoginAudience) => {
    setSessionCookieClient(ttlSeconds);
    const result = await validateAudienceAccess(audience);
    if (!result.ok) {
      const sb = createClient();
      await sb.auth.signOut();
      setGatewayError(`${result.message} Usa o acesso correto.`);
      router.replace(result.suggestedPath.includes("?") ? `${result.suggestedPath}&mismatch=1` : `${result.suggestedPath}?mismatch=1`);
      return false;
    }

    router.push(result.suggestedPath);
    router.refresh();
    return true;
  };

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pwLoading || !selectedAudience) return;
    setPwError("");
    setGatewayError("");
    setPwLoading(true);

    try {
      const sb = createClient();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        setPwError("Email ou password incorretos.");
        return;
      }

      await completeLogin(rememberMe ? SESSION_TTL.LONG : SESSION_TTL.DAY, selectedAudience);
    } catch {
      setPwError("Erro inesperado. Tenta novamente.");
    } finally {
      setPwLoading(false);
    }
  };

  const handleSendOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otpLoading || otpCooldown > 0 || !selectedAudience) return;
    setOtpError("");
    setGatewayError("");
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

      setOtpCode("");
      setOtpStep("code");
      startCooldown();
    } catch {
      setOtpError("Erro ao enviar código. Tenta novamente.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otpLoading || otpCode.length !== 6 || !selectedAudience) return;
    setOtpError("");
    setGatewayError("");
    setOtpLoading(true);

    try {
      const sb = createClient();
      const { error } = await sb.auth.verifyOtp({
        email: otpEmail,
        token: otpCode.trim(),
        type: "email",
      });
      if (error) {
        setOtpError("Código inválido ou expirado.");
        return;
      }

      await completeLogin(SESSION_TTL.SHORT, selectedAudience);
    } catch {
      setOtpError("Erro ao verificar código. Tenta novamente.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0 || otpLoading || !selectedAudience) return;
    setOtpError("");
    setGatewayError("");
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
      setOtpCode("");
      startCooldown();
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "azure") => {
    if (!selectedAudience) return;
    const loadingState = provider === "azure" ? "microsoft" : "google";
    setOauthLoading(loadingState);
    setOauthError("");
    setGatewayError("");

    try {
      const sb = createClient();
      const redirectUrl = new URL("/auth/callback", window.location.origin);
      redirectUrl.searchParams.set("ttl", rememberMe ? "30d" : "24h");
      redirectUrl.searchParams.set("audience", selectedAudience);
      redirectUrl.searchParams.set("next", selectedAudience === "team" ? "/app/dashboard" : "/portal");
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl.toString(),
        },
      });
      if (error) {
        setOauthError("Não foi possível iniciar SSO.");
        setOauthLoading(null);
      }
    } catch {
      setOauthError("Erro de rede ao iniciar SSO.");
      setOauthLoading(null);
    }
  };

  const tabItems: Array<{ id: AuthTab; label: string }> = [
    { id: "password", label: "Password" },
    { id: "otp", label: "Código" },
    { id: "oauth", label: "OAuth" },
  ];

  if (selectedAudience === "collaborator") return null;

  if (selectedAudience === "client") {
    return null;
  }

  return (
    <AuthShell maxWidth={1400}>
      <motion.div
        initial={motionEnabled ? "initial" : false}
        animate={motionEnabled ? "animate" : undefined}
        variants={variants.page}
        transition={transitions.page}
        className="w-full"
      >
        <section className="card-glass overflow-hidden rounded-[32px] border" style={{ borderColor: "var(--border-soft)" }}>
          <div className="grid min-h-[680px] md:grid-cols-[1.1fr_1fr]">
            <aside className="relative hidden overflow-hidden border-r md:flex md:flex-col" style={{ borderColor: "var(--border)" }}>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(52rem 34rem at 16% 14%, rgba(26,143,163,0.22), transparent 60%), radial-gradient(48rem 28rem at 80% 88%, rgba(216,206,246,0.22), transparent 55%)",
                }}
              />

              <div className="relative z-10 p-9 lg:p-11">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: "var(--accent-primary)", color: "#f8fbfc" }}>
                  <Zap className="h-5 w-5" />
                </div>
                <h1 className="mt-5 text-[2.2rem] font-[540] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                  Beyond Pricing
                </h1>
                <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
                  Acede diretamente ao teu dashboard premium e mantém autenticação por password, código OTP ou SSO.
                </p>

                <div className="mt-8 space-y-3">
                  <div className="pill inline-flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Sessões seguras com TTL
                  </div>
                  <div className="pill inline-flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    UI premium com motion suave
                  </div>
                </div>
              </div>
            </aside>

            <div className="p-5 sm:p-7 md:p-9">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>
                    {audienceLabel(selectedAudience)}
                  </p>
                  <h2 className="mt-1.5 text-[1.75rem] font-[560] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                    Entrar na plataforma
                  </h2>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    className="text-xs"
                    style={{ color: "var(--text-3)" }}
                    onClick={() => router.push("/login")}
                  >
                    Mudar acesso
                  </button>
                  <motion.button
                    type="button"
                    className="pill inline-flex items-center gap-2"
                    onClick={() => setRememberMe((current) => !current)}
                    aria-pressed={rememberMe}
                    {...buttonMotionProps({ enabled: motionEnabled })}
                  >
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border"
                      style={{
                        borderColor: rememberMe ? "transparent" : "var(--border-soft)",
                        background: rememberMe ? "var(--accent-primary)" : "transparent",
                        color: "#fff",
                      }}
                    >
                      {rememberMe ? <CheckCircle2 className="h-3 w-3" /> : null}
                    </span>
                    30 dias
                  </motion.button>
                </div>
              </div>

              {expired ? (
                <motion.div
                  initial={motionEnabled ? "initial" : false}
                  animate={motionEnabled ? "animate" : undefined}
                  variants={variants.page}
                  transition={transitions.smooth}
                  className="alert alert-error mb-4"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">Sessão expirada. Entra novamente.</span>
                </motion.div>
              ) : null}

              {mismatch ? (
                <div className="alert alert-error mb-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">
                    Conta sem permissão para este acesso.
                    {expectedAudience ? ` Usa "${audienceLabel(expectedAudience)}".` : ""}
                  </span>
                </div>
              ) : null}

              {gatewayError ? (
                <div className="alert alert-error mb-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">{gatewayError}</span>
                </div>
              ) : null}

              <div className="mb-5 flex flex-wrap gap-2">
                {tabItems.map((item) => (
                  <motion.button
                    key={item.id}
                    type="button"
                    className={`pill ${tab === item.id ? "pill-active" : ""}`}
                    onClick={() => {
                      setTab(item.id);
                      setPwError("");
                      setOtpError("");
                      setOauthError("");
                      setGatewayError("");
                    }}
                    {...buttonMotionProps({ enabled: motionEnabled })}
                  >
                    {item.label}
                  </motion.button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {tab === "password" ? (
                  <motion.form
                    key="password-tab"
                    onSubmit={handlePasswordLogin}
                    className="space-y-4"
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
                          autoComplete="email"
                          autoFocus
                          className="input w-full pl-9"
                          placeholder="tu@beyondfocus.pt"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="label">Password</label>
                        <a href="/reset-password" className="text-xs" style={{ color: "var(--accent-2)" }}>
                          Esqueci a password
                        </a>
                      </div>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
                        <input
                          type={showPw ? "text" : "password"}
                          required
                          autoComplete="current-password"
                          className="input w-full pl-9 pr-10"
                          placeholder="••••••••"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                        <motion.button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
                          onClick={() => setShowPw((current) => !current)}
                          {...buttonMotionProps({ enabled: motionEnabled })}
                        >
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </motion.button>
                      </div>
                      <p className="text-xs" style={{ color: passwordStrength.tone }}>
                        Força: {passwordStrength.label}
                      </p>
                    </div>

                    {pwError ? (
                      <motion.div className="alert alert-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{pwError}</span>
                      </motion.div>
                    ) : null}

                    <motion.button
                      type="submit"
                      disabled={pwLoading || !email || !password}
                      className="btn btn-primary btn-lg w-full"
                      {...buttonMotionProps({ enabled: motionEnabled })}
                    >
                      {pwLoading ? <><Spinner /> A entrar…</> : <>Entrar <ArrowRight className="h-4 w-4" /></>}
                    </motion.button>
                  </motion.form>
                ) : null}

                {tab === "otp" ? (
                  <motion.div
                    key="otp-tab"
                    initial={motionEnabled ? "initial" : false}
                    animate={motionEnabled ? "animate" : undefined}
                    exit={motionEnabled ? "exit" : undefined}
                    variants={variants.tab}
                    transition={transitions.page}
                    className="space-y-4"
                  >
                    {otpStep === "email" ? (
                      <form onSubmit={handleSendOtp} className="space-y-4">
                        <p className="text-sm" style={{ color: "var(--text-2)" }}>
                          Enviamos um código de 6 dígitos para login rápido. Sessão OTP: 1 hora.
                        </p>
                        <div className="space-y-1.5">
                          <label className="label">Email</label>
                          <div className="relative">
                            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
                            <input
                              type="email"
                              required
                              autoFocus
                              className="input w-full pl-9"
                              placeholder="tu@beyondfocus.pt"
                              value={otpEmail}
                              onChange={(event) => setOtpEmail(event.target.value)}
                            />
                          </div>
                        </div>

                        {otpError ? (
                          <div className="alert alert-error">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span className="text-sm">{otpError}</span>
                          </div>
                        ) : null}

                        <motion.button
                          type="submit"
                          disabled={otpLoading || !otpEmail || otpCooldown > 0}
                          className="btn btn-primary btn-lg w-full"
                          {...buttonMotionProps({ enabled: motionEnabled })}
                        >
                          {otpLoading ? <><Spinner /> A enviar…</> : <>Enviar código <ArrowRight className="h-4 w-4" /></>}
                        </motion.button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyOtp} className="space-y-4">
                        <p className="text-sm" style={{ color: "var(--text-2)" }}>
                          Introduz o código enviado para <span style={{ color: "var(--text)" }}>{otpEmail}</span>.
                        </p>

                        <OtpCodeInput
                          value={otpCode}
                          onChange={(next) => setOtpCode(next.replace(/\D/g, "").slice(0, 6))}
                          autoFocus
                          disabled={otpLoading}
                        />

                        {otpError ? (
                          <div className="alert alert-error">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span className="text-sm">{otpError}</span>
                          </div>
                        ) : null}

                        <motion.button
                          type="submit"
                          disabled={otpLoading || otpCode.length < 6}
                          className="btn btn-primary btn-lg w-full"
                          {...buttonMotionProps({ enabled: motionEnabled })}
                        >
                          {otpLoading ? <><Spinner /> A verificar…</> : <>Verificar código <ArrowRight className="h-4 w-4" /></>}
                        </motion.button>

                        <div className="flex items-center justify-between text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setOtpStep("email");
                              setOtpCode("");
                              setOtpError("");
                            }}
                            style={{ color: "var(--text-3)" }}
                          >
                            Mudar email
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={handleResendOtp}
                            disabled={otpCooldown > 0 || otpLoading}
                            style={{ color: otpCooldown > 0 ? "var(--text-3)" : "var(--accent-2)" }}
                          >
                            <RefreshCw className="h-3 w-3" />
                            {otpCooldown > 0 ? `Reenviar (${otpCooldown}s)` : "Reenviar código"}
                          </button>
                        </div>
                      </form>
                    )}
                  </motion.div>
                ) : null}

                {tab === "oauth" ? (
                  <motion.div
                    key="oauth-tab"
                    initial={motionEnabled ? "initial" : false}
                    animate={motionEnabled ? "animate" : undefined}
                    exit={motionEnabled ? "exit" : undefined}
                    variants={variants.tab}
                    transition={transitions.page}
                    className="space-y-4"
                  >
                    <p className="text-sm" style={{ color: "var(--text-2)" }}>
                      Continua com SSO. TTL: 24h, ou 30 dias com toggle ativo.
                    </p>

                    <motion.button
                      type="button"
                      disabled={oauthLoading !== null}
                      onClick={() => handleOAuth("google")}
                      className="btn btn-secondary w-full justify-center gap-2"
                      {...buttonMotionProps({ enabled: motionEnabled })}
                    >
                      {oauthLoading === "google" ? <Spinner /> : <GoogleIcon />}
                      Google
                    </motion.button>

                    <motion.button
                      type="button"
                      disabled={oauthLoading !== null}
                      onClick={() => handleOAuth("azure")}
                      className="btn btn-secondary w-full justify-center gap-2"
                      {...buttonMotionProps({ enabled: motionEnabled })}
                    >
                      {oauthLoading === "microsoft" ? <Spinner /> : <MicrosoftIcon />}
                      Microsoft
                    </motion.button>

                    {oauthError ? (
                      <div className="alert alert-error">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{oauthError}</span>
                      </div>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </motion.div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
