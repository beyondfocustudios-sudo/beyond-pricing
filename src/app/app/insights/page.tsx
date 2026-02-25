"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { fmtEur } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { ChartCard, PillButton } from "@/components/ui-kit";
import {
  AlertTriangle,
  BarChart2,
  CheckCircle,
  RefreshCw,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ProjectRow {
  id: string;
  project_name: string;
  status: string;
  created_at: string;
  deleted_at?: string | null;
  archived_at?: string | null;
  calc: {
    preco_recomendado?: number;
    preco_minimo?: number;
    custo_direto?: number;
    margem_alvo_valor?: number;
  } | null;
  inputs: {
    margem_alvo_pct?: number;
    overhead_pct?: number;
    itens?: Array<{ categoria: string; quantidade: number; preco_unitario: number }>;
  } | null;
}

interface GuardrailAlert {
  type: "warning" | "ok";
  message: string;
  project: string;
}

type AdminAction = "recalc" | "cleanup" | null;
const EXCLUDED_STATUSES = new Set(["archived", "deleted", "arquivado", "apagado", "cancelled", "cancelado"]);

function shouldExcludeProject(project: ProjectRow) {
  const normalized = (project.status ?? "").trim().toLowerCase();
  return Boolean(project.deleted_at) || Boolean(project.archived_at) || EXCLUDED_STATUSES.has(normalized);
}

async function fetchInsightsProjects() {
  const sb = createClient();
  const attempts = [
    sb
      .from("projects")
      .select("id, project_name, status, created_at, calc, inputs, deleted_at, archived_at")
      .is("deleted_at", null)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(80),
    sb
      .from("projects")
      .select("id, project_name, status, created_at, calc, inputs, deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(80),
    sb
      .from("projects")
      .select("id, project_name, status, created_at, calc, inputs")
      .order("created_at", { ascending: false })
      .limit(80),
  ];

  let lastError: string | null = null;
  for (const query of attempts) {
    const res = await query;
    if (!res.error) return (res.data ?? []) as ProjectRow[];
    lastError = res.error.message;
  }
  throw new Error(lastError ?? "Falha ao carregar projetos de insights");
}

export default function InsightsPage() {
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [adminAction, setAdminAction] = useState<AdminAction>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminResult, setAdminResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchInsightsProjects();
      setProjects(rows.filter((project) => !shouldExcludeProject(project)));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Falha ao carregar insights";
      toast.error(`Erro ao carregar insights: ${msg}`);
      setLoadError(msg);
      setProjects([]);
    }

    const roleRes = await fetch("/api/admin/org-role");
    if (roleRes.ok) {
      const roleData = await roleRes.json() as { role: string | null; isAdmin: boolean };
      setAdminRole(roleData.role);
      setIsAdmin(roleData.isAdmin);
    }

    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const withCalc = useMemo(() => projects.filter((project) => Number(project.calc?.preco_recomendado ?? 0) > 0), [projects]);
  const totalRevenue = withCalc.reduce((sum, project) => sum + Number(project.calc?.preco_recomendado ?? 0), 0);
  const avgPrice = withCalc.length > 0 ? totalRevenue / withCalc.length : 0;

  const approved = projects.filter((project) => ["aprovado", "approved"].includes((project.status ?? "").toLowerCase())).length;
  const sentOrReview = projects.filter((project) => ["enviado", "sent", "in_review"].includes((project.status ?? "").toLowerCase())).length;
  const approvalRate = sentOrReview + approved > 0 ? Math.round((approved / (sentOrReview + approved)) * 100) : 0;

  const monthlyData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = date.toLocaleDateString("pt-PT", { month: "short" });
      const total = projects
        .filter((project) => {
          const created = new Date(project.created_at);
          return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth();
        })
        .reduce((sum, project) => sum + Number(project.calc?.preco_recomendado ?? 0), 0);
      return { label, total };
    });
  }, [projects]);

  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const project of projects) {
      for (const item of project.inputs?.itens ?? []) {
        totals[item.categoria] = (totals[item.categoria] ?? 0) + item.quantidade * item.preco_unitario;
      }
    }

    const colors: Record<string, string> = {
      crew: "#1a8fa3",
      equipamento: "#8b6b56",
      pos_producao: "#7c3aed",
      despesas: "#d97706",
      outro: "#5a6280",
    };

    const labels: Record<string, string> = {
      crew: "Equipa",
      equipamento: "Equipamento",
      pos_producao: "Pós-Prod.",
      despesas: "Despesas",
      outro: "Outro",
    };

    return Object.entries(totals)
      .map(([cat, value]) => ({
        name: labels[cat] ?? cat,
        value,
        color: colors[cat] ?? "#5a6280",
      }))
      .sort((a, b) => b.value - a.value);
  }, [projects]);

  const alerts = useMemo(() => {
    const next: GuardrailAlert[] = [];
    for (const project of projects.slice(0, 12)) {
      const margin = Number(project.inputs?.margem_alvo_pct ?? 0);
      const overhead = Number(project.inputs?.overhead_pct ?? 0);
      const price = Number(project.calc?.preco_recomendado ?? 0);

      if (margin < 15 && price > 0) {
        next.push({
          type: "warning",
          message: `Margem baixa (${margin}%) — abaixo do mínimo recomendado`,
          project: project.project_name,
        });
      }
      if (overhead > 40) {
        next.push({
          type: "warning",
          message: `Overhead muito elevado (${overhead}%)`,
          project: project.project_name,
        });
      }
      if (["enviado", "sent", "in_review"].includes((project.status ?? "").toLowerCase()) && price > 0 && margin >= 20) {
        next.push({
          type: "ok",
          message: `Orçamento saudável (margem ${margin}%)`,
          project: project.project_name,
        });
      }
    }
    return next;
  }, [projects]);

  const handleAdminAction = async () => {
    if (!adminAction) return;
    setAdminLoading(true);
    setAdminResult(null);

    try {
      const endpoint = adminAction === "recalc" ? "/api/insights/recalculate" : "/api/insights/cleanup";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });

      const payload = await response.json() as { message?: string; error?: string; cleared?: number };
      if (!response.ok) {
        toast.error(payload.error ?? "Falha na ação admin");
      } else {
        const msg = payload.message ?? (adminAction === "recalc" ? "Insights recalculados" : "Cache limpa");
        setAdminResult(msg);
        toast.success(msg);
        await load();
      }
    } catch {
      toast.error("Erro de rede nas ferramentas admin");
    } finally {
      setAdminLoading(false);
      setAdminAction(null);
    }
  };

  const stats = [
    {
      label: "Receita Total",
      value: fmtEur(totalRevenue),
      sub: `${withCalc.length} projetos`,
      icon: TrendingUp,
      color: "#34d399",
    },
    {
      label: "Preço Médio",
      value: fmtEur(avgPrice),
      sub: "por projeto",
      icon: BarChart2,
      color: "var(--accent-2)",
    },
    {
      label: "Taxa de Aprovação",
      value: `${approvalRate}%`,
      sub: `${approved} aprovados`,
      icon: Target,
      color: "#d97706",
    },
    {
      label: "Em Pipeline",
      value: String(sentOrReview),
      sub: "enviados / em revisão",
      icon: TrendingUp,
      color: "#7c3aed",
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      <div className="page-header">
        <div>
          <h1 className="page-title">Insights</h1>
          <p className="page-subtitle">Análise histórica (exclui deleted/archived)</p>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-card">
              <div className="skeleton h-10 w-10 rounded-xl" />
              <div className="space-y-2 mt-2">
                <div className="skeleton h-7 w-20" />
                <div className="skeleton h-4 w-28" />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <section className="card">
          <div className="empty-state">
            <BarChart2 className="empty-icon" />
            <p className="empty-title">Erro ao carregar insights</p>
            <p className="empty-desc">{loadError}</p>
            <PillButton onClick={() => void load()} className="px-4 py-2 text-xs">
              Tentar novamente
            </PillButton>
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="stat-card"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${stat.color}18` }}>
                  <stat.icon className="h-5 w-5" style={{ color: stat.color }} />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold" style={{ color: "var(--text)", letterSpacing: "-0.03em" }}>{stat.value}</p>
                  <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-2)" }}>{stat.label}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{stat.sub}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <ChartCard title="Forecast">
                <p className="mb-3 text-xs" style={{ color: "var(--text-3)" }}>
                  Receita mensal (últimos 6 meses)
                </p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} barSize={28}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 8" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip
                        formatter={(value: unknown) => [fmtEur(Number(value ?? 0)), "Receita"]}
                        contentStyle={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-soft)",
                          borderRadius: "16px",
                          fontSize: "0.8rem",
                          color: "var(--text)",
                        }}
                      />
                      <Bar dataKey="total" radius={[10, 10, 0, 0]}>
                        {monthlyData.map((_, i) => (
                          <Cell key={i} fill={i === 5 ? "var(--accent-primary)" : "rgba(26,143,163,0.38)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </motion.div>

            {categoryData.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                <ChartCard title="Composição de custos">
                  <div className="space-y-3">
                    {categoryData.map((category) => {
                      const maxVal = categoryData[0]?.value ?? 1;
                      const pct = Math.round((category.value / maxVal) * 100);
                      return (
                        <div key={category.name}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full" style={{ background: category.color }} />
                              <span className="text-xs" style={{ color: "var(--text-2)" }}>{category.name}</span>
                            </div>
                            <span className="text-xs font-medium tabular-nums" style={{ color: "var(--text)" }}>
                              {fmtEur(category.value)}
                            </span>
                          </div>
                          <div className="w-full rounded-full overflow-hidden" style={{ height: "4px", background: "var(--surface-3)" }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: category.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ChartCard>
              </motion.div>
            )}
          </div>

          {alerts.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="card space-y-3">
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Guardrails — Alertas e Validações
              </p>
              <div className="space-y-2">
                {alerts.slice(0, 8).map((alert, index) => (
                  <div
                    key={`${alert.project}-${index}`}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                    style={{
                      background: alert.type === "warning" ? "rgba(217,119,6,0.08)" : "rgba(52,211,153,0.06)",
                      border: `1px solid ${alert.type === "warning" ? "rgba(217,119,6,0.2)" : "rgba(52,211,153,0.15)"}`,
                    }}
                  >
                    {alert.type === "warning" ? (
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#d97706" }} />
                    ) : (
                      <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#34d399" }} />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>{alert.project}</p>
                      <p className="text-xs" style={{ color: "var(--text-3)" }}>{alert.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {isAdmin ? (
            <section className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Ferramentas (Admin)</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>Role atual: {adminRole ?? "-"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <PillButton className="px-3 py-2 text-xs" onClick={() => setAdminAction("recalc")}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Recalcular insights
                  </PillButton>
                  <PillButton className="px-3 py-2 text-xs" onClick={() => setAdminAction("cleanup")}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Limpar dados de teste
                  </PillButton>
                </div>
              </div>
              {adminResult ? <p className="text-xs" style={{ color: "var(--text-2)" }}>{adminResult}</p> : null}
            </section>
          ) : null}

          {projects.length === 0 && (
            <div className="card">
              <div className="empty-state">
                <BarChart2 className="empty-icon" />
                <p className="empty-title">Sem dados ainda</p>
                <p className="empty-desc">Cria projetos para ver insights de pricing</p>
              </div>
            </div>
          )}
        </>
      )}

      {adminAction ? (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {adminAction === "recalc" ? "Confirmar recálculo" : "Confirmar limpeza"}
              </h3>
            </div>
            <div className="modal-body">
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                {adminAction === "recalc"
                  ? "Isto vai recalcular métricas de insights para o ambiente atual."
                  : "Isto vai limpar caches de teste (sem apagar projetos reais)."}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setAdminAction(null)} disabled={adminLoading}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdminAction} disabled={adminLoading}>
                {adminLoading ? "A processar..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
