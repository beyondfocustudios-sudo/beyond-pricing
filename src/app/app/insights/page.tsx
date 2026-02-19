"use client";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { fmtEur } from "@/lib/utils";
import { TrendingUp, BarChart2, Target, AlertTriangle, CheckCircle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line,
} from "recharts";

interface ProjectRow {
  id: string;
  project_name: string;
  status: string;
  created_at: string;
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

export default function InsightsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data } = await sb
      .from("projects")
      .select("id, project_name, status, created_at, calc, inputs")
      .order("created_at", { ascending: false })
      .limit(50);
    setProjects((data ?? []) as ProjectRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived stats ─────────────────────────────────────────────
  const withCalc = projects.filter((p) => p.calc?.preco_recomendado);
  const totalRevenue = withCalc.reduce((s, p) => s + (p.calc?.preco_recomendado ?? 0), 0);
  const avgPrice = withCalc.length > 0 ? totalRevenue / withCalc.length : 0;
  const approved  = projects.filter((p) => p.status === "aprovado").length;
  const sent      = projects.filter((p) => p.status === "enviado").length;
  const approvalRate = sent + approved > 0 ? Math.round((approved / (sent + approved)) * 100) : 0;

  // Monthly revenue chart (last 6 months)
  const monthlyData = (() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const label = d.toLocaleDateString("pt-PT", { month: "short" });
      const total = projects
        .filter((p) => {
          const pd = new Date(p.created_at);
          return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth();
        })
        .reduce((s, p) => s + (p.calc?.preco_recomendado ?? 0), 0);
      return { label, total };
    });
  })();

  // Category distribution across all projects
  const catData = (() => {
    const cats: Record<string, number> = {};
    for (const p of projects) {
      for (const item of p.inputs?.itens ?? []) {
        cats[item.categoria] = (cats[item.categoria] ?? 0) + item.quantidade * item.preco_unitario;
      }
    }
    const catColors: Record<string, string> = {
      crew: "#1a8fa3", equipamento: "#8b6b56", pos_producao: "#7c3aed",
      despesas: "#d97706", outro: "#5a6280",
    };
    const catLabels: Record<string, string> = {
      crew: "Equipa", equipamento: "Equipamento", pos_producao: "Pós-Prod.",
      despesas: "Despesas", outro: "Outro",
    };
    return Object.entries(cats).map(([cat, val]) => ({
      name: catLabels[cat] ?? cat,
      value: val,
      color: catColors[cat] ?? "#5a6280",
    })).sort((a, b) => b.value - a.value);
  })();

  // Guardrails engine
  const alerts: GuardrailAlert[] = [];
  for (const p of projects.slice(0, 10)) {
    const m = p.inputs?.margem_alvo_pct ?? 0;
    const o = p.inputs?.overhead_pct ?? 0;
    const price = p.calc?.preco_recomendado ?? 0;

    if (m < 15 && price > 0) {
      alerts.push({ type: "warning", message: `Margem baixa (${m}%) — abaixo do mínimo recomendado`, project: p.project_name });
    }
    if (o > 40) {
      alerts.push({ type: "warning", message: `Overhead muito elevado (${o}%)`, project: p.project_name });
    }
    if (p.status === "enviado" && price > 0 && m >= 20) {
      alerts.push({ type: "ok", message: `Orçamento saudável (margem ${m}%)`, project: p.project_name });
    }
  }

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
      value: String(sent),
      sub: "orçamentos enviados",
      icon: TrendingUp,
      color: "#7c3aed",
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      <div className="page-header">
        <div>
          <h1 className="page-title">Insights</h1>
          <p className="page-subtitle">Análise histórica de preços e performance</p>
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
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="stat-card"
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: `${s.color}18` }}
                >
                  <s.icon className="h-5 w-5" style={{ color: s.color }} />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold" style={{ color: "var(--text)", letterSpacing: "-0.03em" }}>
                    {s.value}
                  </p>
                  <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-2)" }}>
                    {s.label}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                    {s.sub}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Charts grid */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Monthly revenue trend */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="card"
            >
              <p className="text-sm font-semibold mb-4" style={{ color: "var(--text)" }}>
                Receita por Mês (últimos 6 meses)
              </p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} barSize={28}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--text-3)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => [fmtEur(Number(v ?? 0)), "Receita"]}
                      contentStyle={{
                        background: "var(--surface-3)",
                        border: "1px solid var(--border-2)",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        color: "var(--text)",
                      }}
                    />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                      {monthlyData.map((_, i) => (
                        <Cell key={i} fill={i === 5 ? "#1a8fa3" : "rgba(26,143,163,0.35)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Category breakdown */}
            {catData.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="card"
              >
                <p className="text-sm font-semibold mb-4" style={{ color: "var(--text)" }}>
                  Distribuição por Categoria
                </p>
                <div className="space-y-3">
                  {catData.map((c) => {
                    const maxVal = catData[0]?.value ?? 1;
                    const pct = Math.round((c.value / maxVal) * 100);
                    return (
                      <div key={c.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                            <span className="text-xs" style={{ color: "var(--text-2)" }}>{c.name}</span>
                          </div>
                          <span className="text-xs font-medium tabular-nums" style={{ color: "var(--text)" }}>
                            {fmtEur(c.value)}
                          </span>
                        </div>
                        <div className="w-full rounded-full overflow-hidden" style={{ height: "4px", background: "var(--surface-3)" }}>
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: c.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>

          {/* Guardrails alerts */}
          {alerts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="card space-y-3"
            >
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Guardrails — Alertas e Validações
              </p>
              <div className="space-y-2">
                {alerts.slice(0, 8).map((alert, i) => (
                  <div
                    key={i}
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
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>
                        {alert.project}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-3)" }}>
                        {alert.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Empty state */}
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
    </div>
  );
}
