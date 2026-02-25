"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight, FolderOpen, Loader2, Search } from "lucide-react";
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

function mapFocusToTab(focus: string | null) {
  if (focus === "deliveries") return "deliveries";
  if (focus === "inbox") return "inbox";
  if (focus === "calendar") return "calendar";
  if (focus === "approvals") return "approvals";
  return "overview";
}

export default function PortalProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const motionEnabled = useMotionEnabled();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const impersonationToken = searchParams.get("impersonate");
  const focus = searchParams.get("focus");
  const activeTab = mapFocusToTab(focus);

  const openProject = useCallback(
    (projectId: string) => {
      const params = new URLSearchParams();
      params.set("tab", activeTab);
      if (impersonationToken) params.set("impersonate", impersonationToken);
      router.push(`/portal/projects/${projectId}?${params.toString()}`);
    },
    [activeTab, impersonationToken, router],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (impersonationToken) {
        const response = await fetch(`/api/portal/impersonation/projects?token=${encodeURIComponent(impersonationToken)}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as { projects?: PortalProject[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar os projetos.");
        setProjects(payload.projects ?? []);
        return;
      }

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
      setProjects(dedup.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar projetos.");
    } finally {
      setLoading(false);
    }
  }, [impersonationToken, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter((project) => `${project.project_name} ${project.client_name ?? ""}`.toLowerCase().includes(term));
  }, [projects, search]);

  return (
    <div className="space-y-5 pb-24">
      <div className="card p-5">
        <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Portal</p>
        <h1 className="mt-1 text-xl font-semibold" style={{ color: "var(--text)" }}>Projetos</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
          Seleciona um projeto para abrir overview, entregas, aprovações ou inbox.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-2)" }}>
          <span className="pill">Filtro ativo: {activeTab === "overview" ? "Overview" : activeTab}</span>
          <span className="pill">Total: {filteredProjects.length}</span>
        </div>

        <div className="relative mt-4 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
          <input
            className="input w-full pl-9"
            placeholder="Pesquisar projeto ou cliente"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="card min-h-[240px] flex items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--text-3)" }} />
        </div>
      ) : error ? (
        <div className="card p-5 space-y-3">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Erro ao carregar projetos</p>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>{error}</p>
          <button className="btn btn-secondary btn-sm" onClick={load}>Tentar novamente</button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="card p-5 text-sm" style={{ color: "var(--text-2)" }}>
          Não há projetos para mostrar com este filtro.
        </div>
      ) : (
        <motion.div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          initial={motionEnabled ? "initial" : false}
          animate={motionEnabled ? "animate" : undefined}
          variants={variants.containerStagger}
        >
          {filteredProjects.map((project) => (
            <motion.button
              key={project.id}
              className="card card-hover p-4 text-left"
              variants={variants.cardEnter}
              onClick={() => openProject(project.id)}
              {...buttonMotionProps({ enabled: motionEnabled })}
            >
              <div className="flex items-start gap-3">
                <span
                  className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--accent-dim)", color: "var(--accent-primary)" }}
                >
                  <FolderOpen className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{project.project_name}</p>
                  <p className="truncate text-xs" style={{ color: "var(--text-3)" }}>
                    {STATUS_LABELS[String(project.status ?? "")] ?? (project.status || "Em progresso")}
                  </p>
                  <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>
                    Atualizado {formatDate(project.updated_at)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4" style={{ color: "var(--text-3)" }} />
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
