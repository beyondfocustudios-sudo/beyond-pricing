"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { fmtEur, formatDateShort } from "@/lib/utils";
import { PROJECT_STATUS, type ProjectStatus } from "@/lib/types";
import { Plus, Search, Folder, Filter } from "lucide-react";

interface ProjectRow {
  id: string;
  project_name: string;
  client_name: string;
  status: ProjectStatus;
  created_at: string;
  calc: { preco_recomendado?: number } | null;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const sb = createClient();
    const { data } = await sb
      .from("projects")
      .select("id, project_name, client_name, status, created_at, calc")
      .order("created_at", { ascending: false });
    setProjects((data ?? []) as ProjectRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = projects.filter((p) => {
    const matchSearch =
      !search ||
      p.project_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.client_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Projetos</h1>
          <p className="page-subtitle">Orçamentos e precificação</p>
        </div>
        <Link href="/app/projects/new" className="btn btn-primary">
          <Plus className="h-4 w-4" />
          Novo Projeto
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "var(--text-3)" }} />
          <input
            type="text"
            placeholder="Pesquisar projetos ou clientes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ paddingLeft: "2.5rem" }}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "var(--text-3)" }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input"
            style={{ paddingLeft: "2.5rem", minWidth: "10rem" }}
          >
            <option value="">Todos os estados</option>
            {PROJECT_STATUS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card" style={{ padding: "1rem" }}>
              <div className="flex items-center gap-3">
                <div className="skeleton h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-48" />
                  <div className="skeleton h-3 w-32" />
                </div>
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Folder className="empty-icon" />
            <p className="empty-title">{search || statusFilter ? "Nenhum resultado" : "Sem projetos"}</p>
            <p className="empty-desc">
              {search || statusFilter
                ? "Tenta alterar os filtros de pesquisa"
                : "Cria o primeiro orçamento de produção"}
            </p>
            {!search && !statusFilter && (
              <Link href="/app/projects/new" className="btn btn-primary btn-sm">
                <Plus className="h-3.5 w-3.5" />
                Novo Projeto
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p, i) => {
            const statusInfo = PROJECT_STATUS.find((s) => s.value === p.status);
            const valor = p.calc?.preco_recomendado;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
              >
                <Link
                  href={`/app/projects/${p.id}`}
                  className="card card-hover flex items-center gap-3"
                  style={{ padding: "1rem 1.25rem" }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                    style={{ background: "var(--accent-dim)", color: "var(--accent-2)" }}
                  >
                    {p.project_name?.[0]?.toUpperCase() ?? "P"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                      {p.project_name}
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--text-3)" }}>
                      {p.client_name || "Sem cliente"} · {formatDateShort(p.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {valor && valor > 0 && (
                      <span className="text-sm font-semibold hidden sm:block" style={{ color: "var(--accent-2)" }}>
                        {fmtEur(valor)}
                      </span>
                    )}
                    {statusInfo && (
                      <span className={`badge ${statusInfo.badge}`}>
                        {statusInfo.label}
                      </span>
                    )}
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
