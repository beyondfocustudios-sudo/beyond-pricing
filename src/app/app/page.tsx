"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { fmtEur, formatDateShort } from "@/lib/utils";
import { PROJECT_STATUS } from "@/lib/types";
import {
  Calculator,
  CheckSquare,
  FileText,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
  Folder,
} from "lucide-react";

interface DashStats {
  projects: number;
  projetos_valor: number;
  checklists: number;
  templates: number;
}

interface RecentProject {
  id: string;
  project_name: string;
  client_name: string;
  status: string;
  created_at: string;
  calc: { preco_recomendado: number } | null;
}

import type { Variants } from "framer-motion";

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats>({ projects: 0, projetos_valor: 0, checklists: 0, templates: 0 });
  const [recentes, setRecentes] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const sb = createClient();
      const [proj, chk, tpl] = await Promise.all([
        sb.from("projects").select("id, project_name, client_name, status, created_at, calc").order("created_at", { ascending: false }).limit(5),
        sb.from("checklists").select("id", { count: "exact", head: true }),
        sb.from("templates").select("id", { count: "exact", head: true }),
      ]);

      const projectsData = (proj.data ?? []) as RecentProject[];
      const totalValor = projectsData.reduce((sum, p) => {
        const val = (p.calc as { preco_recomendado?: number } | null)?.preco_recomendado ?? 0;
        return sum + val;
      }, 0);

      setStats({
        projects: projectsData.length,
        projetos_valor: totalValor,
        checklists: chk.count ?? 0,
        templates: tpl.count ?? 0,
      });
      setRecentes(projectsData);
      setLoading(false);
    };
    load();
  }, []);

  const cards = [
    {
      label: "Projetos",
      value: stats.projects,
      sub: stats.projetos_valor > 0 ? fmtEur(stats.projetos_valor) : "—",
      subLabel: "valor total",
      icon: Calculator,
      href: "/app/projects",
      pastel: "card-pastel-blue",
      textColor: "var(--pastel-blue-text)",
    },
    {
      label: "Checklists",
      value: stats.checklists,
      sub: null,
      subLabel: "de produção",
      icon: CheckSquare,
      href: "/app/checklists",
      pastel: "card-pastel-purple",
      textColor: "var(--pastel-purple-text)",
    },
    {
      label: "Templates",
      value: stats.templates,
      sub: null,
      subLabel: "reutilizáveis",
      icon: FileText,
      href: "/app/templates",
      pastel: "card-pastel-amber",
      textColor: "var(--pastel-amber-text)",
    },
    {
      label: "Pipeline",
      value: recentes.filter((p) => p.status === "enviado").length,
      sub: null,
      subLabel: "orçamentos enviados",
      icon: TrendingUp,
      href: "/app/projects",
      pastel: "card-pastel-green",
      textColor: "var(--pastel-green-text)",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-gradient-hero rounded-3xl px-8 py-10 flex items-center justify-between gap-4 flex-wrap"
      >
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Visão geral da plataforma</p>
        </div>
        <Link href="/app/projects/new" className="btn btn-primary">
          <Plus className="h-4 w-4" />
          Novo Projeto
        </Link>
      </motion.div>

      {/* Stats cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid gap-4 grid-cols-2 lg:grid-cols-4"
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="stat-card">
                <div className="skeleton h-10 w-10 rounded-xl" />
                <div className="space-y-2 mt-2">
                  <div className="skeleton h-7 w-16" />
                  <div className="skeleton h-4 w-24" />
                </div>
              </div>
            ))
          : cards.map((c) => (
              <motion.div key={c.label} variants={itemVariants}>
                <Link href={c.href} className={`${c.pastel} block group card-hover`}>
                  <div className="flex items-start justify-between">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: "rgba(255,255,255,0.3)" }}
                    >
                      <c.icon className="h-5 w-5" style={{ color: c.textColor }} />
                    </div>
                    <ArrowRight
                      className="h-4 w-4 opacity-0 group-hover:opacity-60 transition-opacity"
                      style={{ color: c.textColor }}
                    />
                  </div>
                  <div className="mt-3">
                    <p
                      className="text-2xl font-bold tracking-tight"
                      style={{ color: c.textColor, letterSpacing: "-0.03em" }}
                    >
                      {c.value}
                    </p>
                    <p className="text-sm font-medium mt-0.5" style={{ color: c.textColor, opacity: 0.8 }}>
                      {c.label}
                    </p>
                    {c.sub && (
                      <p className="text-xs mt-1" style={{ color: c.textColor, opacity: 0.7 }}>
                        {c.sub}
                      </p>
                    )}
                    {!c.sub && (
                      <p className="text-xs mt-1" style={{ color: c.textColor, opacity: 0.6 }}>
                        {c.subLabel}
                      </p>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
      </motion.div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        <p className="section-title mb-3">Acções rápidas</p>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          {[
            { label: "Novo orçamento", desc: "Criar projeto e calcular preço", href: "/app/projects/new", icon: Calculator, color: "var(--accent)" },
            { label: "Nova checklist", desc: "Acompanhar produção", href: "/app/checklists/new", icon: CheckSquare, color: "#7c3aed" },
            { label: "Ver templates", desc: "Reutilizar estruturas", href: "/app/templates", icon: FileText, color: "#d97706" },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="card card-hover flex items-center gap-4"
              style={{ padding: "1rem 1.25rem" }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${action.color}20` }}
              >
                <action.icon className="h-4.5 w-4.5" style={{ color: action.color, width: "1.125rem", height: "1.125rem" }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                  {action.label}
                </p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  {action.desc}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 ml-auto shrink-0" style={{ color: "var(--text-3)" }} />
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Recent projects */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="section-title">Projetos recentes</p>
          <Link
            href="/app/projects"
            className="text-xs font-medium transition"
            style={{ color: "var(--accent-2)" }}
          >
            Ver todos
          </Link>
        </div>

        {loading ? (
          <div className="card space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-9 w-9 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-4 w-48" />
                  <div className="skeleton h-3 w-32" />
                </div>
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : recentes.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Folder className="empty-icon" />
              <p className="empty-title">Sem projetos ainda</p>
              <p className="empty-desc">Cria o primeiro orçamento para começar</p>
              <Link href="/app/projects/new" className="btn btn-primary btn-sm">
                <Plus className="h-3.5 w-3.5" />
                Novo Projeto
              </Link>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {recentes.map((p, i) => {
                const statusInfo = PROJECT_STATUS.find((s) => s.value === p.status);
                const valor = (p.calc as { preco_recomendado?: number } | null)?.preco_recomendado;
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 px-4 py-3 transition-colors"
                    style={{ background: "transparent" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{ background: "var(--accent-dim)", color: "var(--accent-2)" }}
                    >
                      {p.project_name?.[0]?.toUpperCase() ?? "P"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/app/projects/${p.id}`}
                        className="text-sm font-medium truncate block hover:underline"
                        style={{ color: "var(--text)" }}
                      >
                        {p.project_name}
                      </Link>
                      <p className="text-xs truncate" style={{ color: "var(--text-3)" }}>
                        {p.client_name || "Sem cliente"} · {formatDateShort(p.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {valor && valor > 0 && (
                        <span className="text-xs font-medium hidden sm:block" style={{ color: "var(--accent-2)" }}>
                          {fmtEur(valor)}
                        </span>
                      )}
                      {statusInfo && (
                        <span className={`badge ${statusInfo.badge}`}>
                          {statusInfo.label}
                        </span>
                      )}
                    </div>
                    <Clock className="h-3.5 w-3.5 shrink-0 hidden sm:block" style={{ color: "var(--text-3)" }} />
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
