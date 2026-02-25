"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  FolderOpen,
  Loader2,
  MessageCircle,
  Package,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { buttonMotionProps, useMotionEnabled, variants } from "@/lib/motion";

type PortalProject = {
  id: string;
  project_name: string;
  client_name?: string | null;
  status?: string | null;
  updated_at: string;
  created_at?: string;
};

type Milestone = {
  id: string;
  project_id: string;
  title: string;
  phase?: string | null;
  status?: string | null;
  due_date?: string | null;
};

type Deliverable = {
  id: string;
  project_id: string;
  title: string;
  status?: string | null;
  created_at: string;
};

type ConversationItem = {
  id: string;
  project_id?: string;
  project_name?: string | null;
  last_message?: string | null;
  updated_at: string;
};

type ActivityEvent = {
  id: string;
  type: "milestone" | "delivery" | "message";
  title: string;
  subtitle: string;
  at: string;
  href: string;
};

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Pré-produção",
  enviado: "Em aprovação",
  aprovado: "Aprovado",
  cancelado: "Cancelado",
  arquivado: "Arquivado",
  draft: "Pré-produção",
  sent: "Em aprovação",
  in_review: "Em revisão",
  approved: "Aprovado",
  cancelled: "Cancelado",
  archived: "Arquivado",
};

function formatDate(iso?: string | null) {
  if (!iso) return "sem data";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "sem data";
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

function isPendingStatus(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  return ["sent", "in_review", "review", "pendente", "enviado"].includes(normalized);
}

function isActiveProject(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  return normalized !== "archived" && normalized !== "cancelled" && normalized !== "arquivado" && normalized !== "cancelado";
}

export default function PortalHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const motionEnabled = useMotionEnabled();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clientName, setClientName] = useState<string | null>(null);
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [upcomingMilestones, setUpcomingMilestones] = useState<Milestone[]>([]);
  const [latestDeliverables, setLatestDeliverables] = useState<Deliverable[]>([]);
  const [latestMessages, setLatestMessages] = useState<ConversationItem[]>([]);

  const impersonationToken = searchParams.get("impersonate");

  const withImpersonation = useCallback(
    (href: string) => {
      if (!impersonationToken) return href;
      const hasQuery = href.includes("?");
      return `${href}${hasQuery ? "&" : "?"}impersonate=${encodeURIComponent(impersonationToken)}`;
    },
    [impersonationToken],
  );

  const openProject = useCallback(
    (projectId: string, tab?: string) => {
      const query = new URLSearchParams();
      if (tab) query.set("tab", tab);
      if (impersonationToken) query.set("impersonate", impersonationToken);
      const qs = query.toString();
      router.push(`/portal/projects/${projectId}${qs ? `?${qs}` : ""}`);
    },
    [impersonationToken, router],
  );

  const loadNormalPortal = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [clientRoleRes, teamRoleRes] = await Promise.all([
      fetch("/api/auth/validate-audience?audience=client", { cache: "no-store" }),
      fetch("/api/auth/validate-audience?audience=team", { cache: "no-store" }),
    ]);

    if (!clientRoleRes.ok) {
      if (teamRoleRes.ok) {
        const payload = await teamRoleRes.json().catch(() => ({} as { redirectPath?: string }));
        router.replace(payload.redirectPath ?? "/app/dashboard");
        return;
      }
      router.replace("/portal/login?mismatch=1");
      return;
    }

    const { data: memberRows } = await supabase
      .from("project_members")
      .select("project_id, projects:project_id(id, project_name, client_name, status, updated_at, created_at)")
      .eq("user_id", user?.id ?? "")
      .in("role", ["client_viewer", "client_approver"])
      .not("projects", "is", null);

    const mapped = (memberRows ?? [])
      .map((row: { projects: PortalProject | PortalProject[] | null }) =>
        Array.isArray(row.projects) ? row.projects[0] : row.projects,
      )
      .filter(Boolean) as PortalProject[];

    const dedup = Array.from(new Map(mapped.map((project) => [project.id, project])).values());
    const sortedProjects = dedup.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    setProjects(sortedProjects);

    if (sortedProjects.length === 0) {
      setUpcomingMilestones([]);
      setLatestDeliverables([]);
      setLatestMessages([]);
      setClientName(user?.user_metadata?.full_name ?? user?.email ?? null);
      return;
    }

    const projectIds = sortedProjects.map((project) => project.id);

    const [milestonesRes, deliverablesRes, conversationsRes] = await Promise.all([
      supabase
        .from("project_milestones")
        .select("id, project_id, title, phase, status, due_date")
        .in("project_id", projectIds)
        .is("deleted_at", null)
        .order("due_date", { ascending: true })
        .limit(8),
      supabase
        .from("deliverables")
        .select("id, project_id, title, status, created_at")
        .in("project_id", projectIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(7),
      fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      }),
    ]);

    const openMilestones = (milestonesRes.data ?? []).filter((item) => item.status !== "completed");
    setUpcomingMilestones(openMilestones.slice(0, 6) as Milestone[]);
    setLatestDeliverables((deliverablesRes.data ?? []) as Deliverable[]);

    if (conversationsRes.ok) {
      const convPayload = (await conversationsRes.json()) as { conversations?: ConversationItem[] };
      setLatestMessages((convPayload.conversations ?? []).slice(0, 5));
    } else {
      setLatestMessages([]);
    }

    setClientName(user?.user_metadata?.full_name ?? user?.email ?? null);
  }, [router]);

  const loadImpersonationPortal = useCallback(async (token: string) => {
    const response = await fetch(`/api/portal/impersonation/projects?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      client?: { name?: string };
      projects?: PortalProject[];
      upcomingMilestones?: Milestone[];
      latestDeliverables?: Deliverable[];
      latestMessages?: Array<{ project_id?: string | null; body?: string | null; created_at: string }>;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Falha ao carregar portal em modo visualização.");
    }

    const impersonationProjects = payload.projects ?? [];
    setClientName(payload.client?.name ?? "Cliente");
    setProjects(impersonationProjects);
    setUpcomingMilestones(payload.upcomingMilestones ?? []);
    setLatestDeliverables(payload.latestDeliverables ?? []);

    const messagePreview = (payload.latestMessages ?? []).map((message, index) => ({
      id: `${index}-${message.created_at}`,
      project_id: message.project_id ?? undefined,
      project_name:
        impersonationProjects.find((project) => project.id === message.project_id)?.project_name ?? "Projeto",
      last_message: message.body ?? null,
      updated_at: message.created_at,
    }));
    setLatestMessages(messagePreview);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (impersonationToken) {
        await loadImpersonationPortal(impersonationToken);
      } else {
        await loadNormalPortal();
      }
    } catch (loadErr) {
      setError(loadErr instanceof Error ? loadErr.message : "Não foi possível carregar o portal.");
    } finally {
      setLoading(false);
    }
  }, [impersonationToken, loadImpersonationPortal, loadNormalPortal]);

  useEffect(() => {
    void load();
  }, [load]);

  const primaryProject = useMemo(() => projects[0] ?? null, [projects]);

  const activeProjectsCount = useMemo(() => projects.filter((project) => isActiveProject(project.status)).length, [projects]);

  const deliveriesLast7Days = useMemo(() => {
    const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return latestDeliverables.filter((item) => new Date(item.created_at).getTime() >= threshold).length;
  }, [latestDeliverables]);

  const pendingApprovals = useMemo(
    () => latestDeliverables.filter((item) => isPendingStatus(item.status)).length,
    [latestDeliverables],
  );

  const messagesToReply = latestMessages.length;

  const activityFeed = useMemo<ActivityEvent[]>(() => {
    const projectById = new Map(projects.map((project) => [project.id, project]));

    const milestones = upcomingMilestones.map((milestone) => ({
      id: `milestone-${milestone.id}`,
      type: "milestone" as const,
      title: milestone.title,
      subtitle: `${milestone.phase ?? "Fase"} · ${formatDate(milestone.due_date)}`,
      at: milestone.due_date ?? new Date().toISOString(),
      href: withImpersonation(`/portal/projects/${milestone.project_id}?tab=overview`),
    }));

    const deliveries = latestDeliverables.map((deliverable) => ({
      id: `delivery-${deliverable.id}`,
      type: "delivery" as const,
      title: deliverable.title,
      subtitle: `${projectById.get(deliverable.project_id)?.project_name ?? "Projeto"} · ${deliverable.status ?? "review"}`,
      at: deliverable.created_at,
      href: withImpersonation(`/portal/review/${deliverable.id}`),
    }));

    const messages = latestMessages.map((message) => ({
      id: `message-${message.id}`,
      type: "message" as const,
      title: message.project_name ?? "Mensagem recebida",
      subtitle: message.last_message ?? "Nova atualização da equipa",
      at: message.updated_at,
      href: withImpersonation(`/portal/projects/${message.project_id ?? primaryProject?.id ?? ""}?tab=inbox`),
    }));

    return [...milestones, ...deliveries, ...messages]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 8);
  }, [latestDeliverables, latestMessages, primaryProject?.id, projects, upcomingMilestones, withImpersonation]);

  if (loading) {
    return (
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="card h-[96px] animate-pulse" style={{ background: "var(--surface-2)" }} />
          ))}
        </div>
        <div className="card min-h-[340px] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--text-3)" }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 text-center space-y-3">
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Erro ao carregar dashboard</p>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>{error}</p>
        <button className="btn btn-secondary btn-sm" onClick={load}>Tentar novamente</button>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-5 pb-24"
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? "animate" : undefined}
      variants={variants.containerStagger}
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            key: "projects",
            label: "Projetos ativos",
            value: activeProjectsCount,
            hint: "Projetos em andamento",
            icon: FolderOpen,
            onClick: () => router.push(withImpersonation("/portal/projects")),
          },
          {
            key: "deliveries",
            label: "Entregas novas",
            value: deliveriesLast7Days,
            hint: "Últimos 7 dias",
            icon: Package,
            onClick: () =>
              primaryProject ? openProject(primaryProject.id, "deliveries") : router.push(withImpersonation("/portal/projects")),
          },
          {
            key: "approvals",
            label: "Aprovações pendentes",
            value: pendingApprovals,
            hint: "Aguardam decisão",
            icon: AlertCircle,
            onClick: () =>
              primaryProject ? openProject(primaryProject.id, "approvals") : router.push(withImpersonation("/portal/projects")),
          },
          {
            key: "messages",
            label: "Mensagens",
            value: messagesToReply,
            hint: "Conversas recentes",
            icon: MessageCircle,
            onClick: () =>
              primaryProject ? openProject(primaryProject.id, "inbox") : router.push(withImpersonation("/portal/projects")),
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <motion.button
              key={kpi.key}
              className="card card-hover p-4 text-left"
              variants={variants.cardEnter}
              onClick={kpi.onClick}
              {...buttonMotionProps({ enabled: motionEnabled })}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>{kpi.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.02em]" style={{ color: "var(--text)" }}>{kpi.value}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>{kpi.hint}</p>
                </div>
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full"
                  style={{ background: "var(--surface-2)", color: "var(--accent-primary)", border: "1px solid var(--border)" }}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
            </motion.button>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <motion.article className="card p-5" variants={variants.cardEnter}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Atividade do projeto</p>
              <h2 className="mt-1 text-lg font-semibold" style={{ color: "var(--text)" }}>Timeline recente</h2>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>Conta: {clientName ?? "Cliente Beyond"}</p>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => router.push(withImpersonation("/portal/projects"))}
            >
              Ver todos
            </button>
          </div>

          <div className="mt-4 space-y-2.5">
            {activityFeed.length === 0 ? (
              <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-2)" }}>
                Ainda não há atividade recente. Assim que houver entregas, marcos ou mensagens, aparecem aqui.
              </div>
            ) : (
              activityFeed.map((item) => (
                <motion.button
                  key={item.id}
                  className="w-full rounded-2xl border px-4 py-3 text-left"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                  onClick={() => router.push(item.href)}
                  variants={variants.itemEnter}
                  {...buttonMotionProps({ enabled: motionEnabled, hoverY: -1.5 })}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{item.title}</p>
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>{formatDate(item.at)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs" style={{ color: "var(--text-2)" }}>{item.subtitle}</p>
                </motion.button>
              ))
            )}
          </div>
        </motion.article>

        <div className="grid gap-5">
          <motion.article className="card p-5" variants={variants.cardEnter}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Últimas entregas</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  primaryProject ? openProject(primaryProject.id, "deliveries") : router.push(withImpersonation("/portal/projects"))
                }
              >
                Abrir
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {latestDeliverables.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem entregas recentes.</p>
              ) : (
                latestDeliverables.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    className="w-full rounded-xl border px-3 py-2 text-left"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                    onClick={() => router.push(withImpersonation(`/portal/review/${item.id}`))}
                  >
                    <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{item.title}</p>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>{item.status ?? "review"} · {formatDate(item.created_at)}</p>
                  </button>
                ))
              )}
            </div>
          </motion.article>

          <motion.article className="card p-5" variants={variants.cardEnter}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Mensagens</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  primaryProject ? openProject(primaryProject.id, "inbox") : router.push(withImpersonation("/portal/projects"))
                }
              >
                Inbox
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {latestMessages.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem mensagens recentes.</p>
              ) : (
                latestMessages.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    className="w-full rounded-xl border px-3 py-2 text-left"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                    onClick={() => item.project_id && openProject(item.project_id, "inbox")}
                  >
                    <p className="truncate text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
                      {item.project_name ?? "Projeto"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm" style={{ color: "var(--text)" }}>{item.last_message ?? "Nova atualização"}</p>
                  </button>
                ))
              )}
            </div>
          </motion.article>
        </div>
      </section>

      <motion.section className="card p-5" variants={variants.cardEnter}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Projetos</p>
            <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>Abrir projeto</h3>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => router.push(withImpersonation("/portal/projects"))}>
            Ver lista completa
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-2)" }}>
            Nenhum projeto associado. Contacta a equipa Beyond para ativarem o acesso.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.slice(0, 6).map((project) => (
              <motion.button
                key={project.id}
                className="w-full rounded-2xl border px-4 py-3 text-left"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                onClick={() => openProject(project.id, "overview")}
                variants={variants.itemEnter}
                {...buttonMotionProps({ enabled: motionEnabled, hoverY: -1.5 })}
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "var(--accent-dim)", color: "var(--accent-primary)" }}>
                    <FolderOpen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{project.project_name}</p>
                    <p className="truncate text-xs" style={{ color: "var(--text-3)" }}>
                      {STATUS_LABELS[String(project.status ?? "")] ?? (project.status || "Em progresso")} · atualizado {formatDate(project.updated_at)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4" style={{ color: "var(--text-3)" }} />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </motion.section>

      {primaryProject ? (
        <motion.section className="card p-4" variants={variants.itemEnter}>
          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-2)" }}>
            <CalendarDays className="h-4 w-4" />
            <span>
              Próximas fases e agenda estão em <strong style={{ color: "var(--text)" }}>{primaryProject.project_name}</strong>.
            </span>
            <button className="btn btn-secondary btn-sm ml-auto" onClick={() => openProject(primaryProject.id, "calendar")}>
              Abrir agenda
            </button>
          </div>
        </motion.section>
      ) : null}
    </motion.div>
  );
}
