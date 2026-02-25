"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronRight, FolderOpen, Loader2, MessageCircle, Package } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { EmptyState } from "@/components/ui-kit";

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

export default function PortalHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clientName, setClientName] = useState<string | null>(null);
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [upcomingMilestones, setUpcomingMilestones] = useState<Milestone[]>([]);
  const [latestDeliverables, setLatestDeliverables] = useState<Deliverable[]>([]);
  const [latestMessages, setLatestMessages] = useState<ConversationItem[]>([]);

  const impersonationToken = searchParams.get("impersonate");

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
      .map((row: { projects: PortalProject | PortalProject[] | null }) => (Array.isArray(row.projects) ? row.projects[0] : row.projects))
      .filter(Boolean) as PortalProject[];

    const dedup = Array.from(new Map(mapped.map((project) => [project.id, project])).values());
    const sortedProjects = dedup.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    setProjects(sortedProjects);

    if (sortedProjects.length === 0) {
      setUpcomingMilestones([]);
      setLatestDeliverables([]);
      setLatestMessages([]);
      setClientName(user?.user_metadata?.full_name ?? null);
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
        .limit(6),
      supabase
        .from("deliverables")
        .select("id, project_id, title, status, created_at")
        .in("project_id", projectIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(3),
      fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      }),
    ]);

    const openMilestones = (milestonesRes.data ?? []).filter((item) => item.status !== "completed");
    setUpcomingMilestones(openMilestones.slice(0, 4) as Milestone[]);
    setLatestDeliverables((deliverablesRes.data ?? []) as Deliverable[]);

    if (conversationsRes.ok) {
      const convPayload = (await conversationsRes.json()) as { conversations?: ConversationItem[] };
      setLatestMessages((convPayload.conversations ?? []).slice(0, 3));
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
      project_name: impersonationProjects.find((project) => project.id === message.project_id)?.project_name ?? "Projeto",
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

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--text-3)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 text-center space-y-3">
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Erro ao carregar portal</p>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>{error}</p>
        <button className="btn btn-secondary btn-sm" onClick={load}>Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card p-6 sm:p-7">
        <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>
          Portal do Cliente
        </p>
        <h1 className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>
          Hi, {clientName ?? "Cliente"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
          Resumo rápido de estado, marcos e comunicação com a equipa.
        </p>

        {primaryProject ? (
          <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>Projeto principal</p>
            <p className="mt-1 text-base font-semibold" style={{ color: "var(--text)" }}>{primaryProject.project_name}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
              {STATUS_LABELS[String(primaryProject.status ?? "")] ?? (primaryProject.status || "Em progresso")}
              {" · "}
              atualizado {formatDate(primaryProject.updated_at)}
            </p>
            <button
              className="btn btn-primary btn-sm mt-3"
              onClick={() => router.push(`/portal/projects/${primaryProject.id}${impersonationToken ? `?impersonate=${encodeURIComponent(impersonationToken)}` : ""}`)}
            >
              Abrir projeto
            </button>
          </div>
        ) : null}
      </section>

      {projects.length === 0 ? (
        <section className="card">
          <EmptyState
            title="Nenhum projeto associado"
            description="Contacta a Beyond Focus para obter acesso ao teu projeto."
            action={<FolderOpen className="empty-icon" />}
          />
        </section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            <article className="card p-4 lg:col-span-1">
              <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Próximos marcos</p>
              <div className="mt-3 space-y-2">
                {upcomingMilestones.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem marcos por agora.</p>
                ) : upcomingMilestones.map((milestone) => (
                  <div key={milestone.id} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{milestone.title}</p>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      {milestone.phase ?? "fase"} · {formatDate(milestone.due_date)}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="card p-4 lg:col-span-1">
              <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Últimas entregas</p>
              <div className="mt-3 space-y-2">
                {latestDeliverables.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem entregas recentes.</p>
                ) : latestDeliverables.map((item) => (
                  <button
                    key={item.id}
                    className="w-full rounded-xl border px-3 py-2 text-left transition hover:opacity-90"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                    onClick={() => router.push(`/portal/review/${item.id}${impersonationToken ? `?impersonate=${encodeURIComponent(impersonationToken)}` : ""}`)}
                  >
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{item.title}</p>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>{formatDate(item.created_at)} · {item.status ?? "review"}</p>
                  </button>
                ))}
              </div>
            </article>

            <article className="card p-4 lg:col-span-1">
              <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Inbox preview</p>
              <div className="mt-3 space-y-2">
                {latestMessages.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem mensagens recentes.</p>
                ) : latestMessages.map((item) => (
                  <div key={item.id} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>{item.project_name ?? "Projeto"}</p>
                    <p className="mt-1 text-sm line-clamp-2" style={{ color: "var(--text)" }}>{item.last_message ?? "Nova atualização"}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
                  Projetos atribuídos
                </p>
                <p className="text-sm" style={{ color: "var(--text-2)" }}>
                  Abre qualquer projeto para ver entregas, feedback e calendário.
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className="w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                  onClick={() => router.push(`/portal/projects/${project.id}${impersonationToken ? `?impersonate=${encodeURIComponent(impersonationToken)}` : ""}`)}
                >
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-dim)", color: "var(--accent-primary)" }}>
                    <FolderOpen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{project.project_name}</p>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      {STATUS_LABELS[String(project.status ?? "")] ?? (project.status || "Em progresso")} · {formatDate(project.updated_at)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4" style={{ color: "var(--text-3)" }} />
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <button className="card p-4 text-left" onClick={() => router.push("/portal")}> 
          <p className="text-xs" style={{ color: "var(--text-3)" }}>Onboarding</p>
          <p className="mt-1 text-sm font-medium" style={{ color: "var(--text)" }}>1. Ver projeto</p>
        </button>
        <button className="card p-4 text-left" onClick={() => primaryProject && router.push(`/portal/projects/${primaryProject.id}${impersonationToken ? `?impersonate=${encodeURIComponent(impersonationToken)}` : ""}`)}>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>Onboarding</p>
          <p className="mt-1 text-sm font-medium" style={{ color: "var(--text)" }}>2. Ver entregas</p>
          <Package className="mt-2 h-4 w-4" style={{ color: "var(--text-3)" }} />
        </button>
        <button className="card p-4 text-left" onClick={() => primaryProject && router.push(`/portal/projects/${primaryProject.id}${impersonationToken ? `?impersonate=${encodeURIComponent(impersonationToken)}` : ""}`)}>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>Onboarding</p>
          <p className="mt-1 text-sm font-medium" style={{ color: "var(--text)" }}>3. Enviar feedback</p>
          <MessageCircle className="mt-2 h-4 w-4" style={{ color: "var(--text-3)" }} />
        </button>
      </section>

      <section className="card p-4">
        <div className="flex items-center gap-2" style={{ color: "var(--text-3)" }}>
          <CalendarDays className="h-4 w-4" />
          <p className="text-xs">Calendário e fases estão disponíveis dentro de cada projeto.</p>
        </div>
      </section>
    </div>
  );
}
