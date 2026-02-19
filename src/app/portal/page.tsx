"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { motion } from "framer-motion";
import Link from "next/link";
import { Folder, Clock, ChevronRight, Film } from "lucide-react";

interface PortalProject {
  id: string;
  project_name: string;
  client_name: string;
  status: string;
  updated_at: string;
  created_at: string;
  role: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  rascunho:  { label: "Em Preparação",  color: "#86868b", bg: "rgba(134,134,139,0.12)" },
  enviado:   { label: "Em Revisão",     color: "#1a8fa3", bg: "rgba(26,143,163,0.12)" },
  aprovado:  { label: "Aprovado",       color: "#34a853", bg: "rgba(52,168,83,0.12)" },
  cancelado: { label: "Cancelado",      color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
  arquivado: { label: "Arquivado",      color: "#86868b", bg: "rgba(134,134,139,0.08)" },
};

export default function PortalHomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.push("/portal/login"); return; }

    // Fetch projects via project_members (internal roles) OR client_users (client roles)
    // We use two queries and merge
    const [membersRes, clientRes] = await Promise.all([
      sb.from("project_members")
        .select("role, projects(id, project_name, client_name, status, updated_at, created_at)")
        .eq("user_id", user.id),
      sb.from("client_users")
        .select("role, clients(projects(id, project_name, client_name, status, updated_at, created_at))")
        .eq("user_id", user.id),
    ]);

    const seen = new Set<string>();
    const list: PortalProject[] = [];

    // Internal member projects
    for (const row of (membersRes.data ?? [])) {
      const p = row.projects as unknown as PortalProject | null;
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      list.push({ ...p, role: row.role });
    }

    // Client-linked projects
    for (const cu of (clientRes.data ?? [])) {
      const client = cu.clients as unknown as { projects: PortalProject[] } | null;
      if (!client) continue;
      for (const p of (client.projects ?? [])) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        list.push({ ...p, role: cu.role });
      }
    }

    // Sort by updated_at desc
    list.sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());

    setProjects(list);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#1d1d1f" }}>Os meus projetos</h1>
          <p className="text-sm mt-0.5" style={{ color: "#86868b" }}>
            Acompanha o progresso e as entregas
          </p>
        </div>
      </div>

      {/* Projects grid */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl p-5 animate-pulse" style={{ background: "rgba(255,255,255,0.7)", height: 120 }} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(20px)" }}
        >
          <Film className="h-10 w-10 mx-auto mb-3" style={{ color: "#86868b" }} />
          <p className="text-sm font-medium" style={{ color: "#1d1d1f" }}>Sem projetos ativos</p>
          <p className="text-xs mt-1" style={{ color: "#86868b" }}>
            Os teus projetos aparecerão aqui quando forem partilhados contigo.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p, i) => {
            const st = STATUS_LABELS[p.status] ?? STATUS_LABELS.rascunho;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35 }}
              >
                <Link href={`/portal/projects/${p.id}`}>
                  <div
                    className="rounded-2xl p-5 transition-all group cursor-pointer"
                    style={{
                      background: "rgba(255,255,255,0.78)",
                      backdropFilter: "blur(20px)",
                      WebkitBackdropFilter: "blur(20px)",
                      boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
                      border: "1px solid rgba(255,255,255,0.6)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: "rgba(26,143,163,0.1)" }}
                        >
                          <Folder className="h-5 w-5" style={{ color: "#1a8fa3" }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "#1d1d1f" }}>
                            {p.project_name}
                          </p>
                          {p.client_name && (
                            <p className="text-xs truncate" style={{ color: "#86868b" }}>{p.client_name}</p>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5"
                        style={{ color: "#86868b" }}
                      />
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {st.label}
                      </span>
                      <span className="flex items-center gap-1 text-xs" style={{ color: "#86868b" }}>
                        <Clock className="h-3 w-3" />
                        {fmtDate(p.updated_at ?? p.created_at)}
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
