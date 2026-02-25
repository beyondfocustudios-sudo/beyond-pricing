"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, CheckCircle2, Lock, Mail, User, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { SESSION_TTL, setSessionCookieClient } from "@/lib/session";
import { buttonMotionProps, transitions, useMotionEnabled, variants } from "@/lib/motion";
import { AuthShell } from "@/components/layout/AuthShell";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4z" />
    </svg>
  );
}

type InviteState = {
  kind: "client" | "collaborator";
  emailMasked: string;
  role: "client_viewer" | "client_approver" | "owner" | "admin" | "editor";
  clientName: string | null;
  projectName: string | null;
  expiresAt: string;
};

function PortalInviteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const motionEnabled = useMotionEnabled();
  const token = searchParams.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [done, setDone] = useState(false);

  const passwordHint = useMemo(() => {
    if (!password) return "Mínimo 8 caracteres";
    if (password.length < 8) return "Password demasiado curta";
    return "Password válida";
  }, [password]);

  useEffect(() => {
    const checkInvite = async () => {
      if (!token) {
        setError("Token de convite em falta.");
        setLoading(false);
        return;
      }

      const tryClient = await fetch(`/api/clients/invites?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const clientData = await tryClient.json().catch(() => ({}));
      if (tryClient.ok) {
        setInvite({
          kind: "client",
          emailMasked: clientData.emailMasked,
          role: clientData.role,
          clientName: clientData.clientName ?? null,
          projectName: null,
          expiresAt: clientData.expiresAt,
        });
        setLoading(false);
        return;
      }

      const tryCollaborator = await fetch(`/api/collaborators/invites?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const collaboratorData = await tryCollaborator.json().catch(() => ({}));
      if (tryCollaborator.ok) {
        setInvite({
          kind: "collaborator",
          emailMasked: collaboratorData.emailMasked,
          role: collaboratorData.role,
          clientName: null,
          projectName: collaboratorData.projectName ?? null,
          expiresAt: collaboratorData.expiresAt,
        });
        setLoading(false);
        return;
      }

      setError(collaboratorData?.error ?? clientData?.error ?? "Convite inválido.");
      setLoading(false);
    };

    void checkInvite();
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !token) return;
    if (password.length < 8) {
      setError("A password deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("As passwords não coincidem.");
      return;
    }

    setSaving(true);
    setError(null);

    const acceptEndpoint = invite?.kind === "collaborator"
      ? "/api/collaborators/invites/accept"
      : "/api/clients/invites/accept";

    const res = await fetch(acceptEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        password,
        fullName: fullName.trim() || undefined,
      }),
    });

    const data = await res.json().catch(() => ({} as { email?: string; error?: string }));
    if (!res.ok || !data.email) {
      setError(data.error ?? "Não foi possível concluir o convite.");
      setSaving(false);
      return;
    }

    const sb = createClient();
    const signIn = await sb.auth.signInWithPassword({ email: data.email, password });
    if (signIn.error) {
      setDone(true);
      setSaving(false);
      return;
    }

    setSessionCookieClient(SESSION_TTL.SHORT);
    router.push(invite?.kind === "collaborator" ? "/app/collaborator" : "/portal");
    router.refresh();
  };

  return (
    <AuthShell maxWidth={820}>
      <motion.div
        initial={motionEnabled ? "initial" : false}
        animate={motionEnabled ? "animate" : undefined}
        variants={variants.page}
        transition={transitions.page}
        className="w-full"
      >
        <section className="card-glass overflow-hidden rounded-[32px] border" style={{ borderColor: "var(--border-soft)" }}>
          <div className="grid min-h-[560px] md:grid-cols-[1fr_1fr]">
            <aside className="relative hidden border-r p-9 md:block" style={{ borderColor: "var(--border)" }}>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(44rem 26rem at 20% 12%, rgba(26,143,163,0.24), transparent 60%), radial-gradient(36rem 20rem at 82% 84%, rgba(244,223,125,0.2), transparent 55%)",
                }}
              />
              <div className="relative z-10">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "var(--accent-primary)", color: "#fff" }}>
                  <Zap className="h-4 w-4" />
                </div>
                <h1 className="mt-5 text-[1.9rem] font-[560] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                  Convite Portal
                </h1>
                <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>
                  Finaliza o convite para aceder ao portal cliente com segurança.
                </p>
              </div>
            </aside>

            <div className="p-6 sm:p-8 md:p-9">
              <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>
                Portal Invite
              </p>
              <h2 className="mt-1.5 text-[1.6rem] font-[560] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                Criar credenciais
              </h2>

              {loading ? (
                <div className="mt-8 inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
                  <Spinner /> A validar convite…
                </div>
              ) : null}

              {!loading && error ? (
                <div className="alert alert-error mt-6">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              ) : null}

              {!loading && done ? (
                <div className="alert alert-success mt-6">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span className="text-sm">
                    {invite?.kind === "collaborator"
                      ? "Conta criada. Faz login em `/login`."
                      : "Conta criada. Faz login em `/portal/login`."}
                  </span>
                </div>
              ) : null}

              {!loading && !error && invite ? (
                <form className="mt-6 space-y-4" onSubmit={submit}>
                  <div className="pill inline-flex items-center gap-2 text-xs">
                    <Mail className="h-3.5 w-3.5" />
                    {invite.emailMasked}
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>
                    {invite.kind === "client"
                      ? `Cliente: ${invite.clientName ?? "—"}`
                      : `Projeto: ${invite.projectName ?? "—"}`}{" "}
                    · Expira em {new Date(invite.expiresAt).toLocaleDateString("pt-PT")}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>
                    Acesso: {invite.kind === "client" ? "Cliente" : "Colaborador"} ({invite.role})
                  </p>

                  <div className="space-y-1.5">
                    <label className="label">Nome (opcional)</label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
                      <input
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        className="input w-full pl-9"
                        placeholder="Nome completo"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="label">Password</label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
                      <input
                        type="password"
                        required
                        autoComplete="new-password"
                        className="input w-full pl-9"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Mínimo 8 caracteres"
                      />
                    </div>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>{passwordHint}</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="label">Confirmar password</label>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      className="input w-full"
                      value={passwordConfirm}
                      onChange={(event) => setPasswordConfirm(event.target.value)}
                      placeholder="Repetir password"
                    />
                  </div>

                  <motion.button
                    type="submit"
                    disabled={saving}
                    className="btn btn-primary btn-lg w-full"
                    {...buttonMotionProps({ enabled: motionEnabled })}
                  >
                    {saving ? <><Spinner /> A concluir…</> : <>Concluir convite <ArrowRight className="h-4 w-4" /></>}
                  </motion.button>
                </form>
              ) : null}
            </div>
          </div>
        </section>
      </motion.div>
    </AuthShell>
  );
}

function LoadingInvite() {
  return (
    <AuthShell maxWidth={640}>
      <div className="flex w-full items-center justify-center rounded-[28px] border p-8 card-glass" style={{ borderColor: "var(--border-soft)" }}>
        <div className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
          <Spinner /> A carregar convite…
        </div>
      </div>
    </AuthShell>
  );
}

export default function PortalInvitePage() {
  return (
    <Suspense fallback={<LoadingInvite />}>
      <PortalInviteInner />
    </Suspense>
  );
}
