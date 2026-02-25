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
import { AuthShell } from "@/components/layout/AuthShell";

type AuthTab = "password" | "otp" | "oauth";
type LoginStep = "email" | "auth";
type LastMethod = "password" | "otp" | "oauth_google" | "oauth_microsoft";
type InferredAccountType = "team" | "client" | "collaborator" | "unknown";

const OTP_COOLDOWN = 30;
const LAST_METHOD_KEY = "bp_last_login_method";
const LAST_EMAIL_KEY = "bp_last_login_email";

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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function methodToTab(method: LastMethod | null): AuthTab {
  if (method === "oauth_google" || method === "oauth_microsoft") return "oauth";
  if (method === "otp") return "otp";
  return "password";
}

function isLastUsedForTab(tab: AuthTab, method: LastMethod | null) {
  if (!method) return false;
  if (tab === "oauth") return method === "oauth_google" || method === "oauth_microsoft";
  return tab === method;
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const motionEnabled = useMotionEnabled();

  const expired = searchParams.get("expired") === "1";
  const mismatch = searchParams.get("mismatch") === "1";

  const [step, setStep] = useState<LoginStep>("email");
  const [tab, setTab] = useState<AuthTab>("password");
  const [rememberMe, setRememberMe] = useState(false);

  const [email, setEmail] = useState("");
  const [lockedEmail, setLockedEmail] = useState("");
  const [inferredType, setInferredType] = useState<InferredAccountType>("unknown");
  const [lastUsedMethod, setLastUsedMethod] = useState<LastMethod | null>(null);

  const [emailStepLoading, setEmailStepLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [oauthLoading, setOauthLoading] = useState<"google" | "microsoft" | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cachedMethod = window.localStorage.getItem(LAST_METHOD_KEY);
    if (
      cachedMethod === "password"
      || cachedMethod === "otp"
      || cachedMethod === "oauth_google"
      || cachedMethod === "oauth_microsoft"
    ) {
      setLastUsedMethod(cachedMethod);
      setTab(methodToTab(cachedMethod));
    }

    const cachedEmail = window.localStorage.getItem(LAST_EMAIL_KEY);
    if (cachedEmail && cachedEmail.includes("@")) {
      setEmail(cachedEmail);
    }
  }, []);

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

  const saveLastUsed = (method: LastMethod, emailForCache: string) => {
    setLastUsedMethod(method);
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(LAST_METHOD_KEY, method);
      window.localStorage.setItem(LAST_EMAIL_KEY, normalizeEmail(emailForCache));
    } catch {
      // Ignore storage failures.
    }
  };

  const resolveRedirectPath = async () => {
    const response = await fetch("/api/auth/resolve-access", { cache: "no-store" });
    const payload = await response.json().catch(() => ({} as { redirectPath?: string; message?: string }));

    if (!response.ok || typeof payload.redirectPath !== "string") {
      throw new Error(payload.message || "Não foi possível iniciar sessão com este e-mail.");
    }

    return payload.redirectPath;
  };

  const completeLogin = async (ttlSeconds: number, method: LastMethod) => {
    setSessionCookieClient(ttlSeconds);
    const redirectPath = await resolveRedirectPath();
    saveLastUsed(method, lockedEmail || email);
    router.push(redirectPath);
    router.refresh();
  };

  const goToStepTwo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (emailStepLoading) return;

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setAuthError("Indica um e-mail válido para continuar.");
      return;
    }

    setEmailStepLoading(true);
    setAuthError("");
    setInferredType("unknown");

    try {
      const response = await fetch("/api/auth/infer-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = await response.json().catch(() => ({} as { inferredType?: InferredAccountType }));
      const nextType = payload?.inferredType ?? "unknown";
      if (nextType === "team" || nextType === "client" || nextType === "collaborator" || nextType === "unknown") {
        setInferredType(nextType);
      }

      setLockedEmail(normalizedEmail);
      setEmail(normalizedEmail);
      setOtpStep("email");
      setOtpCode("");
      setPassword("");

      const preferredTab = lastUsedMethod ? methodToTab(lastUsedMethod) : nextType === "client" ? "otp" : "password";
      setTab(preferredTab);
      setStep("auth");
    } catch {
      setLockedEmail(normalizedEmail);
      setEmail(normalizedEmail);
      setStep("auth");
    } finally {
      setEmailStepLoading(false);
    }
  };

  const switchEmail = () => {
    setStep("email");
    setPassword("");
    setOtpCode("");
    setOtpStep("email");
    setAuthError("");
  };

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pwLoading || !lockedEmail) return;

    setPwLoading(true);
    setAuthError("");

    try {
      const sb = createClient();
      const { error } = await sb.auth.signInWithPassword({
        email: lockedEmail,
        password,
      });
      if (error) {
        setAuthError("Não foi possível iniciar sessão com este e-mail.");
        return;
      }

      await completeLogin(rememberMe ? SESSION_TTL.LONG : SESSION_TTL.DAY, "password");
    } catch {
      setAuthError("Erro inesperado ao iniciar sessão.");
    } finally {
      setPwLoading(false);
    }
  };

  const handleSendOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otpLoading || otpCooldown > 0 || !lockedEmail) return;

    setOtpLoading(true);
    setAuthError("");

    try {
      const sb = createClient();
      const { error } = await sb.auth.signInWithOtp({
        email: lockedEmail,
        options: { shouldCreateUser: false },
      });
      if (error) {
        setAuthError("Não foi possível enviar o código para este e-mail.");
        return;
      }

      setOtpStep("code");
      setOtpCode("");
      startCooldown();
    } catch {
      setAuthError("Erro ao enviar código. Tenta novamente.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otpLoading || otpCode.length !== 6 || !lockedEmail) return;

    setOtpLoading(true);
    setAuthError("");

    try {
      const sb = createClient();
      const { error } = await sb.auth.verifyOtp({
        email: lockedEmail,
        token: otpCode.trim(),
        type: "email",
      });
      if (error) {
        setAuthError("Código inválido ou expirado.");
        return;
      }

      await completeLogin(SESSION_TTL.SHORT, "otp");
    } catch {
      setAuthError("Erro ao verificar código. Tenta novamente.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0 || otpLoading || !lockedEmail) return;

    setOtpLoading(true);
    setAuthError("");

    try {
      const sb = createClient();
      const { error } = await sb.auth.signInWithOtp({
        email: lockedEmail,
        options: { shouldCreateUser: false },
      });
      if (error) {
        setAuthError("Não foi possível reenviar o código.");
        return;
      }

      setOtpCode("");
      startCooldown();
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "azure") => {
    if (oauthLoading) return;

    setAuthError("");
    setOauthLoading(provider === "azure" ? "microsoft" : "google");

    try {
      const sb = createClient();
      const redirectUrl = new URL("/auth/callback", window.location.origin);
      redirectUrl.searchParams.set("ttl", rememberMe ? "30d" : "24h");
      redirectUrl.searchParams.set("next", "/app/dashboard");
      redirectUrl.searchParams.set("method", provider === "google" ? "oauth_google" : "oauth_microsoft");

      if (lockedEmail || email) {
        const currentEmail = normalizeEmail(lockedEmail || email);
        if (currentEmail.includes("@")) {
          try {
            window.localStorage.setItem(LAST_EMAIL_KEY, currentEmail);
          } catch {
            // Ignore storage failures.
          }
        }
      }

      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl.toString(),
        },
      });

      if (error) {
        setAuthError("Não foi possível iniciar SSO.");
        setOauthLoading(null);
      }
    } catch {
      setAuthError("Erro de rede ao iniciar SSO.");
      setOauthLoading(null);
    }
  };

  const tabItems: Array<{ id: AuthTab; label: string }> = [
    { id: "password", label: "Password" },
    { id: "otp", label: "Código" },
    { id: "oauth", label: "OAuth" },
  ];

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
          <div className="grid min-h-[680px] md:grid-cols-[1.08fr_1fr]">
            <aside className="relative hidden overflow-hidden border-r md:flex md:flex-col" style={{ borderColor: "var(--border)" }}>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(52rem 34rem at 16% 14%, rgba(26,143,163,0.22), transparent 60%), radial-gradient(48rem 28rem at 80% 88%, rgba(216,206,246,0.22), transparent 55%)",
                }}
              />

              <div className="relative z-10 flex h-full flex-col justify-between p-9 lg:p-11">
                <div>
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: "var(--accent-primary)", color: "#f8fbfc" }}>
                    <Zap className="h-5 w-5" />
                  </div>
                  <h1 className="mt-5 text-[2.2rem] font-[540] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                    Beyond Pricing
                  </h1>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
                    Gestão completa para projetos audiovisuais com autenticação rápida e acesso automático ao teu ambiente.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="pill inline-flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Sessões seguras com TTL
                  </div>
                  <div className="pill inline-flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Split layout Base44
                  </div>
                  <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border-soft)", background: "color-mix(in srgb, var(--surface) 78%, transparent)" }}>
                    <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
                      Smart Access
                    </p>
                    <p className="mt-1.5 text-xs" style={{ color: "var(--text-2)" }}>
                      O destino final é resolvido automaticamente após autenticação.
                    </p>
                  </div>
                </div>
              </div>
            </aside>

            <div className="p-5 sm:p-7 md:p-9">
              <AnimatePresence mode="wait">
                {step === "email" ? (
                  <motion.div
                    key="login-step-email"
                    initial={motionEnabled ? "initial" : false}
                    animate={motionEnabled ? "animate" : undefined}
                    exit={motionEnabled ? "exit" : undefined}
                    variants={variants.tab}
                    transition={transitions.page}
                    className="mx-auto w-full max-w-[560px]"
                  >
                    <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>
                      Login
                    </p>
                    <h2 className="mt-1.5 text-[2.05rem] font-[560] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                      Bem-vindo ao Beyond
                    </h2>
                    <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
                      Introduz o teu e-mail para continuar sem fricção.
                    </p>

                    {(expired || mismatch) ? (
                      <div className="alert alert-error mt-4">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-sm">
                          {expired
                            ? "Sessão expirada. Entra novamente."
                            : "Não foi possível iniciar sessão com este e-mail."}
                        </span>
                      </div>
                    ) : null}

                    {authError ? (
                      <div className="alert alert-error mt-4">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{authError}</span>
                      </div>
                    ) : null}

                    <div className="mt-6 space-y-4">
                      <motion.button
                        type="button"
                        onClick={() => void handleOAuth("google")}
                        disabled={oauthLoading !== null}
                        className="btn btn-secondary w-full justify-center gap-2"
                        {...buttonMotionProps({ enabled: motionEnabled })}
                      >
                        {oauthLoading === "google" ? <Spinner /> : <GoogleIcon />}
                        Entrar com Google
                      </motion.button>

                      <form onSubmit={goToStepTwo} className="space-y-4">
                        <div className="space-y-1.5">
                          <label className="label">E-mail</label>
                          <div className="relative">
                            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
                            <input
                              type="email"
                              required
                              autoFocus
                              autoComplete="email"
                              className="input w-full pl-9"
                              placeholder="tu@beyondfocus.pt"
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                            />
                          </div>
                        </div>

                        <motion.button
                          type="submit"
                          disabled={emailStepLoading || !email}
                          className="btn btn-primary btn-lg w-full"
                          {...buttonMotionProps({ enabled: motionEnabled })}
                        >
                          {emailStepLoading ? <><Spinner /> A continuar…</> : <>Continuar <ArrowRight className="h-4 w-4" /></>}
                        </motion.button>
                      </form>
                    </div>

                    <p className="mt-6 text-xs" style={{ color: "var(--text-3)" }}>
                      Ao continuar, aceitas os <a href="#" className="underline">Termos</a> e a <a href="#" className="underline">Privacidade</a>.
                    </p>
                  </motion.div>
                ) : null}

                {step === "auth" ? (
                  <motion.div
                    key="login-step-auth"
                    initial={motionEnabled ? "initial" : false}
                    animate={motionEnabled ? "animate" : undefined}
                    exit={motionEnabled ? "exit" : undefined}
                    variants={variants.tab}
                    transition={transitions.page}
                    className="w-full"
                  >
                    <div className="mb-6 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>
                          Entrar
                        </p>
                        <h2 className="mt-1.5 text-[1.75rem] font-[560] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                          Escolhe o método
                        </h2>
                        <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                          {inferredType === "client"
                            ? "Sugerido: Código para acesso rápido ao portal."
                            : "Password, código ou OAuth com redirecionamento automático."}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          className="text-xs"
                          style={{ color: "var(--text-3)" }}
                          onClick={switchEmail}
                        >
                          Mudar e-mail
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

                    <div className="mb-5 space-y-2">
                      <label className="label">E-mail</label>
                      <div className="flex items-center gap-2">
                        <input className="input w-full" value={lockedEmail} readOnly aria-readonly="true" />
                        <button className="btn btn-secondary" type="button" onClick={switchEmail}>Editar</button>
                      </div>
                    </div>

                    {authError ? (
                      <div className="alert alert-error mb-4">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{authError}</span>
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
                            setAuthError("");
                          }}
                          {...buttonMotionProps({ enabled: motionEnabled })}
                        >
                          {item.label}
                          {isLastUsedForTab(item.id, lastUsedMethod) ? (
                            <span className="ml-1 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "var(--border-soft)" }}>
                              Last used
                            </span>
                          ) : null}
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

                          <motion.button
                            type="submit"
                            disabled={pwLoading || !password}
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

                              <motion.button
                                type="submit"
                                disabled={otpLoading || otpCooldown > 0}
                                className="btn btn-primary btn-lg w-full"
                                {...buttonMotionProps({ enabled: motionEnabled })}
                              >
                                {otpLoading ? <><Spinner /> A enviar…</> : <>Enviar código <ArrowRight className="h-4 w-4" /></>}
                              </motion.button>
                            </form>
                          ) : (
                            <form onSubmit={handleVerifyOtp} className="space-y-4">
                              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                                Código enviado para <span className="font-medium" style={{ color: "var(--text)" }}>{lockedEmail}</span>.
                              </p>

                              <OtpCodeInput
                                value={otpCode}
                                onChange={(next) => setOtpCode(next.replace(/\D/g, "").slice(0, 6))}
                                autoFocus
                                disabled={otpLoading}
                              />

                              <motion.button
                                type="submit"
                                disabled={otpLoading || otpCode.length !== 6}
                                className="btn btn-primary btn-lg w-full"
                                {...buttonMotionProps({ enabled: motionEnabled })}
                              >
                                {otpLoading ? <><Spinner /> A validar…</> : <>Entrar <CheckCircle2 className="h-4 w-4" /></>}
                              </motion.button>

                              <div className="flex items-center justify-between gap-3 text-xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOtpStep("email");
                                    setOtpCode("");
                                  }}
                                  style={{ color: "var(--text-3)" }}
                                >
                                  Voltar
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
                            onClick={() => void handleOAuth("google")}
                            className="btn btn-secondary w-full justify-center gap-2"
                            {...buttonMotionProps({ enabled: motionEnabled })}
                          >
                            {oauthLoading === "google" ? <Spinner /> : <GoogleIcon />}
                            Google
                            {lastUsedMethod === "oauth_google" ? (
                              <span className="ml-1 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "var(--border-soft)" }}>
                                Last used
                              </span>
                            ) : null}
                          </motion.button>

                          <motion.button
                            type="button"
                            disabled={oauthLoading !== null}
                            onClick={() => void handleOAuth("azure")}
                            className="btn btn-secondary w-full justify-center gap-2"
                            {...buttonMotionProps({ enabled: motionEnabled })}
                          >
                            {oauthLoading === "microsoft" ? <Spinner /> : <MicrosoftIcon />}
                            Microsoft
                            {lastUsedMethod === "oauth_microsoft" ? (
                              <span className="ml-1 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "var(--border-soft)" }}>
                                Last used
                              </span>
                            ) : null}
                          </motion.button>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
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
