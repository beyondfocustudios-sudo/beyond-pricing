"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { formatDateShort } from "@/lib/utils";
import { Plus, CheckSquare, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";

interface ChecklistRow {
  id: string;
  nome: string;
  project_id: string;
  created_at: string;
  projects?: { project_name: string } | null;
  _count?: number;
}

export default function ChecklistsPage() {
  const [checklists, setChecklists] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const sb = createClient();
    let { data, error } = await sb
      .from("checklists")
      .select("id, nome, project_id, created_at, projects(project_name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error?.code === "42703") {
      ({ data, error } = await sb
        .from("checklists")
        .select("id, nome, project_id, created_at, projects(project_name)")
        .order("created_at", { ascending: false }));
    }

    if (error) {
      toast.error(`Erro ao carregar checklists: ${error.message}`);
      setErrorMsg(error.message);
    }
    setChecklists((data ?? []) as unknown as ChecklistRow[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const deleteChecklist = async (checklist: ChecklistRow) => {
    const confirmed = window.confirm(`Apagar checklist \"${checklist.nome}\"?`);
    if (!confirmed || deletingId) return;

    setDeletingId(checklist.id);
    const sb = createClient();
    const now = new Date().toISOString();

    let { error } = await sb
      .from("checklists")
      .update({ deleted_at: now })
      .eq("id", checklist.id);

    if (error?.code === "42703") {
      ({ error } = await sb.from("checklists").delete().eq("id", checklist.id));
    }

    if (error) {
      toast.error(`Erro ao apagar checklist: ${error.message}`);
    } else {
      toast.success("Checklist apagada");
      setChecklists((current) => current.filter((row) => row.id !== checklist.id));
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Checklists</h1>
          <p className="page-subtitle">Produção em três fases</p>
        </div>
        <Link href="/app/checklists/new" className="btn btn-primary">
          <Plus className="h-4 w-4" />
          Nova Checklist
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card" style={{ padding: "1rem" }}>
              <div className="flex gap-3">
                <div className="skeleton h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-40" />
                  <div className="skeleton h-3 w-28" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : errorMsg ? (
        <div className="card">
          <div className="empty-state">
            <CheckSquare className="empty-icon" />
            <p className="empty-title">Erro ao carregar checklists</p>
            <p className="empty-desc">{errorMsg}</p>
            <button className="btn btn-secondary btn-sm" onClick={load}>Tentar novamente</button>
          </div>
        </div>
      ) : checklists.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <CheckSquare className="empty-icon" />
            <p className="empty-title">Sem checklists</p>
            <p className="empty-desc">Cria checklists de pré-produção, rodagem e pós-produção</p>
            <Link href="/app/checklists/new" className="btn btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" />
              Nova Checklist
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {checklists.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <div className="card flex items-center gap-3" style={{ padding: "1rem 1.25rem" }}>
                <Link href={`/app/checklists/${c.id}`} className="min-w-0 flex flex-1 items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "rgba(124,58,237,0.12)" }}
                  >
                    <CheckSquare className="h-5 w-5" style={{ color: "#7c3aed" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{c.nome}</p>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      {(c.projects as { project_name?: string } | null)?.project_name ?? "Sem projeto"} · {formatDateShort(c.created_at)}
                    </p>
                  </div>
                </Link>

                <button
                  type="button"
                  className="btn btn-ghost btn-icon-sm"
                  onClick={() => void deleteChecklist(c)}
                  disabled={deletingId === c.id}
                  title="Apagar checklist"
                  aria-label="Apagar checklist"
                  style={{ color: "var(--error)" }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
