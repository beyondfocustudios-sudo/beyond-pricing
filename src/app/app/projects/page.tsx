"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { fmtEur, formatDateShort } from "@/lib/utils";
import { PROJECT_STATUS, type ProjectStatus } from "@/lib/types";
import { Plus, Search } from "lucide-react";
import { useToast } from "@/components/Toast";
import { EmptyState, Pill, PillButton, PillInput, SkeletonCard } from "@/components/ui-kit";

interface ProjectRow {
  id: string;
  project_name: string;
  client_name: string;
  status: ProjectStatus;
  created_at: string;
  calc: { preco_recomendado?: number } | null;
}

const PAGE_SIZE = 12;

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const sb = createClient();
    const { data, error } = await sb
      .from("projects")
      .select("id, project_name, client_name, status, created_at, calc")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(`Erro ao carregar projetos: ${error.message}`);
      setError(error.message);
    }

    setProjects((data ?? []) as ProjectRow[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      const matchSearch =
        !search ||
        project.project_name.toLowerCase().includes(search.toLowerCase()) ||
        (project.client_name ?? "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || project.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [projects, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedProjects = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-6 pb-8">
      <section className="surface p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>
              Projects
            </p>
            <h1 className="mt-2 page-title">Projetos</h1>
            <p className="page-subtitle">Cards grandes, filtros em pills e paginação limpa.</p>
          </div>
          <Link href="/app/projects/new" className="btn btn-primary">
            <Plus className="h-4 w-4" />
            Novo Projeto
          </Link>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
            <PillInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por projeto ou cliente"
              className="w-full py-2.5 pl-9 pr-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("")}
              className={`pill ${statusFilter === "" ? "pill-active" : ""}`}
            >
              Todos
            </button>
            {PROJECT_STATUS.map((status) => (
              <button
                key={status.value}
                type="button"
                onClick={() => setStatusFilter(status.value)}
                className={`pill ${statusFilter === status.value ? "pill-active" : ""}`}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} className="h-40" />
          ))}
        </section>
      ) : error ? (
        <section className="card">
          <EmptyState
            title="Erro ao carregar projetos"
            description={error}
            action={
              <PillButton onClick={load} className="px-4 py-2 text-xs">
                Tentar novamente
              </PillButton>
            }
          />
        </section>
      ) : pagedProjects.length === 0 ? (
        <section className="card">
          <EmptyState
            title={search || statusFilter ? "Nenhum resultado" : "Sem projetos"}
            description={
              search || statusFilter
                ? "Ajusta os filtros para encontrar projetos."
                : "Cria o primeiro orçamento para iniciar a operação."
            }
          />
        </section>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pagedProjects.map((project, index) => {
              const statusInfo = PROJECT_STATUS.find((status) => status.value === project.status);
              const value = project.calc?.preco_recomendado ?? 0;
              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: index * 0.04 }}
                >
                  <Link href={`/app/projects/${project.id}`} className="card card-hover block p-5">
                    <div className="mb-4 flex items-start justify-between gap-2">
                      <span
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold"
                        style={{
                          background: "rgba(26, 143, 163, 0.14)",
                          border: "1px solid rgba(26, 143, 163, 0.3)",
                          color: "var(--accent-primary)",
                        }}
                      >
                        {project.project_name.slice(0, 1).toUpperCase()}
                      </span>
                      {statusInfo ? <Pill className="text-[0.7rem]">{statusInfo.label}</Pill> : null}
                    </div>

                    <h2 className="line-clamp-1 text-base font-semibold" style={{ color: "var(--text)" }}>
                      {project.project_name}
                    </h2>
                    <p className="mt-1 line-clamp-1 text-xs" style={{ color: "var(--text-3)" }}>
                      {project.client_name || "Sem cliente"}
                    </p>

                    <div className="mt-5 flex items-end justify-between gap-3">
                      <p className="text-xs" style={{ color: "var(--text-3)" }}>
                        {formatDateShort(project.created_at)}
                      </p>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {value > 0 ? fmtEur(value) : "Sem cálculo"}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </section>

          <section className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              {filtered.length} projetos · página {safePage} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <PillButton
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={safePage <= 1}
                className="px-3 py-2 text-xs"
              >
                Anterior
              </PillButton>
              <PillButton
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-2 text-xs"
              >
                Seguinte
              </PillButton>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
