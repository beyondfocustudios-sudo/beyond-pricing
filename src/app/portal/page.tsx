"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Loader2, FolderOpen, ChevronRight, Circle } from "lucide-react";

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
  const supabase = createClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email ?? null);

      // Get projects via project_members (client roles only)
      const { data } = await supabase
        .from("project_members")
        .select("project_id, projects:project_id(id, name, status, updated_at)")
        .in("role", ["client_viewer", "client_approver"])
        .eq("user_id", user?.id ?? "")
        .not("projects", "is", null);

      const projs = (data ?? [])
        .map((row: { projects: Project | Project[] | null }) => {
          const p = Array.isArray(row.projects) ? row.projects[0] : row.projects;
          return p;
        })
        .filter(Boolean) as Project[];

      setProjects(projs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
      setLoading(false);
    };
    load();
  }, [supabase]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/portal/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--text-3)" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <header
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Beyond Focus</h1>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>{userEmail}</p>
          </div>
          <button
            onClick={logout}
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--text-3)" }}
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <p className="section-title mb-4">Os meus projetos</p>
        {projects.length === 0 ? (
          <div className="empty-state">
            <FolderOpen className="empty-icon" />
            <p className="empty-title">Nenhum projeto associado.</p>
            <p className="empty-desc">Contacta a Beyond Focus para obter acesso.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => router.push(`/portal/projects/${p.id}`)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left group card card-hover"
                style={{ padding: "1rem 1.25rem" }}
              >
                <div className="shrink-0" style={{ color: STATUS_DOT[p.status ?? "enviado"] ?? "var(--text-3)" }}>
                  <Circle className="w-2 h-2 fill-current" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm" style={{ color: "var(--text)" }}>{p.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                    {STATUS_LABELS[p.status ?? "enviado"] ?? p.status} · {new Date(p.updated_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-3)" }} />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
