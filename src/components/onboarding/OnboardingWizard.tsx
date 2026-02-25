"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import { CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck, Sparkles, Users } from "lucide-react";
import { MotionCard, MotionPage, Pressable } from "@/components/motion-system";
import { transitions, variants } from "@/lib/motion";
import { onboardingDonePathForScope, ONBOARDING_TOTAL_STEPS, type OnboardingScope } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

type TeamDirectoryMember = {
  id: string;
  name: string;
  area: "Produção" | "Criativo" | "Operações";
  role: string;
};

const VALUES = [
  { id: "clarity", title: "Clareza", body: "Decisões objetivas, entregas previsíveis e comunicação sem ruído." },
  { id: "craft", title: "Craft", body: "Excelência técnica em cada frame, budget e milestone." },
  { id: "ownership", title: "Ownership", body: "Cada pessoa assume o resultado do início ao fim." },
];

const POLICIES = [
  {
    id: "review_sla",
    title: "SLA de review",
    body: "Feedback de versões deve acontecer até 48h após publicação.",
  },
  {
    id: "security",
    title: "Segurança e acessos",
    body: "Nunca partilhar credenciais. Convites são pessoais e expiram automaticamente.",
  },
  {
    id: "communication",
    title: "Comunicação de projeto",
    body: "Updates críticos devem ser registados em Inbox e no Journal.",
  },
];

const DIRECTORY: TeamDirectoryMember[] = [
  { id: "1", name: "Daniel Lopes", area: "Produção", role: "Founder / Producer" },
  { id: "2", name: "Rita Costa", area: "Criativo", role: "Creative Lead" },
  { id: "3", name: "João Matos", area: "Operações", role: "Operations Manager" },
  { id: "4", name: "Marta Dias", area: "Produção", role: "Project Manager" },
];

const CHECKLIST_BY_SCOPE: Record<OnboardingScope, Array<{ id: string; label: string; href?: string }>> = {
  team: [
    { id: "open_dashboard", label: "Abrir dashboard CEO/Empresa", href: "/app/dashboard" },
    { id: "create_project", label: "Criar o primeiro projeto", href: "/app/projects/new" },
    { id: "open_inbox", label: "Confirmar inbox operacional", href: "/app/inbox" },
    { id: "review_tasks", label: "Validar board de tarefas", href: "/app/tasks" },
  ],
  collaborator: [
    { id: "open_assigned_projects", label: "Ver projetos atribuídos", href: "/app/projects" },
    { id: "open_tasks", label: "Rever tarefas atribuídas", href: "/app/tasks" },
    { id: "open_inbox", label: "Confirmar inbox do projeto", href: "/app/inbox" },
  ],
  client: [
    { id: "open_portal_projects", label: "Ver projetos no portal", href: "/portal" },
    { id: "open_review", label: "Abrir área de aprovações" },
    { id: "send_feedback", label: "Comentar uma versão com timestamp" },
  ],
};

function progressPercentage(step: number) {
  return Math.round(((Math.max(1, step) - 1) / (ONBOARDING_TOTAL_STEPS - 1)) * 100);
}

export function OnboardingWizard({ scope }: { scope: OnboardingScope }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [enableCelebrations, setEnableCelebrations] = useState(true);
  const [valuesSeen, setValuesSeen] = useState<string[]>([]);
  const [policiesSeen, setPoliciesSeen] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [activeValue, setActiveValue] = useState(VALUES[0].id);
  const celebrationFired = useRef(false);

  const checklistItems = CHECKLIST_BY_SCOPE[scope];
  const checklistDone = checklistItems.filter((item) => checklist[item.id]).length;
  const checklistPct = checklistItems.length > 0 ? Math.round((checklistDone / checklistItems.length) * 100) : 0;

  const welcomeTitle = scope === "client"
    ? "Bem-vindo ao Portal Beyond"
    : scope === "collaborator"
      ? "Bem-vindo à Equipa Beyond"
      : "Bem-vindo ao HQ Beyond";

  const subtitle = scope === "client"
    ? "Vamos configurar o teu fluxo de aprovações e feedback sem fricção."
    : scope === "collaborator"
      ? "Configura o teu espaço de colaboração e entrega."
      : "Prepara o ambiente da equipa para execução com contexto completo.";

  const directoryAreas = useMemo(() => {
    if (scope === "client") return [];
    if (scope === "collaborator") return ["Produção"];
    return ["Produção", "Criativo", "Operações"] as const;
  }, [scope]);
  const [activeArea, setActiveArea] = useState<string>(directoryAreas[0] ?? "Produção");

  const filteredDirectory = useMemo(() => {
    if (scope === "client") return [];
    if (scope === "collaborator") return DIRECTORY.filter((m) => m.area === "Produção");
    return DIRECTORY.filter((m) => m.area === activeArea);
  }, [activeArea, scope]);

  const persist = async (payload: {
    currentStep?: number;
    valuesSeen?: string[];
    policiesSeen?: string[];
    checklist?: Record<string, boolean>;
    complete?: boolean;
  }) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          currentStep: payload.currentStep ?? step,
          valuesSeen: payload.valuesSeen,
          policiesSeen: payload.policiesSeen,
          checklist: payload.checklist,
          complete: payload.complete === true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(data.error ?? "Falha ao guardar progresso");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao guardar progresso");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/onboarding/session?scope=${scope}&mode=${scope}`, { cache: "no-store" });
      if (!active) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        setError(data.error ?? "Falha ao carregar onboarding");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!active) return;
      setStep(Math.max(1, Number(data?.session?.currentStep ?? 1)));
      setEnableCelebrations(data?.enableCelebrations !== false);
      setValuesSeen(Array.isArray(data?.progress?.values_seen) ? data.progress.values_seen : []);
      setPoliciesSeen(Array.isArray(data?.progress?.policies_seen) ? data.progress.policies_seen : []);
      setChecklist(typeof data?.progress?.checklist === "object" && data.progress.checklist ? data.progress.checklist : {});
      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [scope]);

  useEffect(() => {
    if (step !== ONBOARDING_TOTAL_STEPS || celebrationFired.current || reduceMotion || !enableCelebrations) return;
    celebrationFired.current = true;
    void confetti({
      particleCount: 70,
      spread: 62,
      origin: { y: 0.74 },
      scalar: 0.9,
    });
  }, [enableCelebrations, reduceMotion, step]);

  const moveStep = async (delta: -1 | 1) => {
    const next = Math.min(ONBOARDING_TOTAL_STEPS, Math.max(1, step + delta));
    setStep(next);
    await persist({ currentStep: next });
  };

  const completeOnboarding = async () => {
    await persist({
      currentStep: ONBOARDING_TOTAL_STEPS,
      valuesSeen,
      policiesSeen,
      checklist,
      complete: true,
    });
    router.push(onboardingDonePathForScope(scope));
    router.refresh();
  };

  if (loading) {
    return (
      <MotionPage className="space-y-5">
        <div className="skeleton-card h-20 rounded-[24px]" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="skeleton-card h-64 rounded-[24px]" />
          <div className="skeleton-card h-64 rounded-[24px]" />
        </div>
      </MotionPage>
    );
  }

  return (
    <MotionPage className="space-y-5">
      <MotionCard className="card rounded-[24px] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>
              Onboarding
            </p>
            <h1 className="mt-1 text-2xl font-semibold" style={{ color: "var(--text)" }}>
              {welcomeTitle}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>{subtitle}</p>
          </div>
          <span className="pill text-xs">{step}/{ONBOARDING_TOTAL_STEPS}</span>
        </div>

        <div className="mt-4 rounded-full" style={{ background: "var(--surface-2)", height: 8 }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: "var(--accent-primary)" }}
            initial={false}
            animate={{ width: `${progressPercentage(step)}%` }}
            transition={transitions.ui}
          />
        </div>
      </MotionCard>

      {error ? (
        <MotionCard className="alert alert-error">
          <span className="text-sm">{error}</span>
        </MotionCard>
      ) : null}

      <AnimatePresence mode="wait">
        <motion.section
          key={`wizard-step-${step}`}
          variants={variants.tab}
          initial={reduceMotion ? false : "initial"}
          animate={reduceMotion ? undefined : "animate"}
          exit={reduceMotion ? undefined : "exit"}
          transition={transitions.page}
          className="card rounded-[24px] p-5"
        >
          {step === 1 ? (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Welcome</h2>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                Esta experiência prepara o teu workspace, políticas e fluxo de trabalho para começares sem fricção.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <Sparkles className="h-4 w-4" style={{ color: "var(--accent-primary)" }} />
                  <p className="mt-2 text-sm font-medium">Base44 UI</p>
                </div>
                <div className="rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <ShieldCheck className="h-4 w-4" style={{ color: "var(--accent-primary)" }} />
                  <p className="mt-2 text-sm font-medium">Permissões seguras</p>
                </div>
                <div className="rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <Users className="h-4 w-4" style={{ color: "var(--accent-primary)" }} />
                  <p className="mt-2 text-sm font-medium">Colaboração guiada</p>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Our Values</h2>
              <div className="flex flex-wrap gap-2">
                {VALUES.map((value) => (
                  <Pressable
                    key={value.id}
                    className={cn("pill px-3 py-1.5 text-xs", activeValue === value.id && "pill-active")}
                    onClick={async () => {
                      setActiveValue(value.id);
                      const next = Array.from(new Set([...valuesSeen, value.id]));
                      setValuesSeen(next);
                      await persist({ valuesSeen: next });
                    }}
                  >
                    {value.title}
                  </Pressable>
                ))}
              </div>
              {VALUES.filter((value) => value.id === activeValue).map((value) => (
                <MotionCard key={value.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
                  <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>{value.title}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>{value.body}</p>
                </MotionCard>
              ))}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Policies</h2>
              {POLICIES
                .filter((policy) => scope !== "collaborator" || policy.id !== "security")
                .map((policy) => {
                  const open = policiesSeen.includes(policy.id);
                  return (
                    <div key={policy.id} className="rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
                      <Pressable
                        className="flex w-full items-center justify-between text-left"
                        onClick={async () => {
                          const next = open
                            ? policiesSeen.filter((id) => id !== policy.id)
                            : [...policiesSeen, policy.id];
                          setPoliciesSeen(next);
                          await persist({ policiesSeen: next });
                        }}
                      >
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{policy.title}</p>
                        <span className="text-xs" style={{ color: "var(--text-3)" }}>{open ? "Ocultar" : "Ver"}</span>
                      </Pressable>
                      {open ? <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>{policy.body}</p> : null}
                    </div>
                  );
                })}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Meet the Team</h2>
              {scope !== "client" ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {directoryAreas.map((area) => (
                      <Pressable
                        key={area}
                        className={cn("pill px-3 py-1.5 text-xs", area === activeArea && "pill-active")}
                        onClick={() => setActiveArea(area)}
                      >
                        {area}
                      </Pressable>
                    ))}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {filteredDirectory.map((person) => (
                      <MotionCard key={person.id} className="rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{person.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>{person.role}</p>
                      </MotionCard>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm" style={{ color: "var(--text-2)" }}>
                  No portal cliente, vais interagir com a equipa através de comentários, aprovações e inbox.
                </p>
              )}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Your Checklist</h2>
                <span className="pill text-xs">{checklistDone} de {checklistItems.length}</span>
              </div>

              <div className="rounded-full" style={{ background: "var(--surface-2)", height: 8 }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "var(--accent-primary)" }}
                  initial={false}
                  animate={{ width: `${checklistPct}%` }}
                  transition={transitions.ui}
                />
              </div>

              <div className="space-y-2">
                {checklistItems.map((item) => {
                  const checked = checklist[item.id] === true;
                  return (
                    <label key={item.id} className="flex items-center gap-3 rounded-2xl border px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={async (event) => {
                          const next = { ...checklist, [item.id]: event.target.checked };
                          setChecklist(next);
                          await persist({ checklist: next });
                        }}
                      />
                      <span className="flex-1 text-sm" style={{ color: checked ? "var(--text)" : "var(--text-2)" }}>
                        {item.label}
                      </span>
                      {item.href ? (
                        <Pressable
                          className="pill px-2.5 py-1 text-xs"
                          onClick={() => router.push(item.href as string)}
                        >
                          Abrir
                        </Pressable>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="mx-auto h-11 w-11" style={{ color: "var(--success)" }} />
              <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
                Onboarding concluído
              </h2>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                O teu ambiente está pronto. Podes continuar para o workspace principal.
              </p>
              <Pressable className="btn btn-primary mx-auto mt-2" onClick={() => void completeOnboarding()}>
                Entrar na plataforma
              </Pressable>
            </div>
          ) : null}
        </motion.section>
      </AnimatePresence>

      <MotionCard className="card rounded-[24px] p-4">
        <div className="flex items-center justify-between gap-2">
          <Pressable className="btn btn-secondary" disabled={step === 1 || saving} onClick={() => void moveStep(-1)}>
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </Pressable>

          <div className="text-xs" style={{ color: "var(--text-3)" }}>
            {saving ? "A guardar..." : "Progresso guardado automaticamente"}
          </div>

          <Pressable className="btn btn-primary" disabled={step === ONBOARDING_TOTAL_STEPS || saving} onClick={() => void moveStep(1)}>
            Continuar
            <ChevronRight className="h-4 w-4" />
          </Pressable>
        </div>
      </MotionCard>
    </MotionPage>
  );
}
