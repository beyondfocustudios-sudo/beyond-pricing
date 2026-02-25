"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Loader2, FolderOpen, ChevronRight, Circle } from "lucide-react";
import { EmptyState } from "@/components/ui-kit";

interface Project {
  id: string;
  name: string;
  status?: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  cancelado: "Cancelado",
  arquivado: "Arquivado",
};

const STATUS_DOT: Record<string, string> = {
  rascunho: "var(--text-3)",
  enviado: "var(--pastel-blue-text)",
  aprovado: "var(--pastel-green-text)",
  cancelado: "var(--error)",
  arquivado: "var(--text-3)",
};

export default function PortalHomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClientView, setIsClientView] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const [clientRoleRes, collaboratorRoleRes] = await Promise.all([
        fetch("/api/auth/validate-audience?audience=client", { cache: "no-store" }),
        fetch("/api/auth/validate-audience?audience=collaborator", { cache: "no-store" }),
      ]);
      const clientMode = clientRoleRes.ok;
      const collaboratorMode = collaboratorRoleRes.ok;
      setIsClientView(clientMode);

      let query = supabase
        .from("project_members")
        .select("project_id, role, projects:project_id(id, name, status, updated_at)")
        .eq("user_id", user?.id ?? "")
        .not("projects", "is", null);

      if (clientMode) {
        query = query.in("role", ["client_viewer", "client_approver"]);
      } else if (collaboratorMode) {
        query = query.in("role", ["owner", "admin", "editor"]);
      }

      const { data } = await query;

      const projs = (data ?? [])
        .map((row: { projects: Project | Project[] | null }) => {
          const p = Array.isArray(row.projects) ? row.projects[0] : row.projects;
          return p;
        })
        .filter(Boolean) as Project[];

      setProjects(projs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
      setLoading(false);
    };
    void load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[36vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--text-3)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>
          {isClientView ? "Client Area" : "Portal Colaborador"}
        </p>
        <h1 className="mt-1 page-title">Projetos</h1>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="Nenhum projeto associado"
          description="Contacta a Beyond Focus para obter acesso ao teu projeto."
          action={<FolderOpen className="empty-icon" />}
        />
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => router.push(`/portal/projects/${project.id}`)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left group card card-hover"
              style={{ padding: "1rem 1.25rem" }}
            >
              <div className="shrink-0" style={{ color: STATUS_DOT[project.status ?? "enviado"] ?? "var(--text-3)" }}>
                <Circle className="w-2 h-2 fill-current" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm" style={{ color: "var(--text)" }}>{project.name}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                  {STATUS_LABELS[project.status ?? "enviado"] ?? project.status} · {new Date(project.updated_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
