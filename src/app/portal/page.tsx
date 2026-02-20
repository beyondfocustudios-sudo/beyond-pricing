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
  rascunho: "text-white/30",
  enviado: "text-blue-400",
  aprovado: "text-emerald-400",
  cancelado: "text-rose-400",
  arquivado: "text-white/20",
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
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="px-4 pt-safe-top pb-4 border-b border-white/5 bg-gray-950/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Beyond Focus</h1>
            <p className="text-xs text-white/40 mt-0.5">{userEmail}</p>
          </div>
          <button onClick={logout} className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20">
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">Os meus projetos</h2>
        {projects.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum projeto associado.</p>
            <p className="text-xs mt-1">Contacta a Beyond Focus para obter acesso.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => router.push(`/portal/projects/${p.id}`)}
                className="w-full flex items-center gap-4 rounded-2xl bg-white/5 border border-white/8 px-5 py-4 hover:bg-white/8 hover:border-white/15 transition-all text-left group"
              >
                <div className={`shrink-0 ${STATUS_DOT[p.status ?? "enviado"] ?? "text-white/30"}`}>
                  <Circle className="w-2 h-2 fill-current" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm group-hover:text-white transition-colors">{p.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {STATUS_LABELS[p.status ?? "enviado"] ?? p.status} · {new Date(p.updated_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
