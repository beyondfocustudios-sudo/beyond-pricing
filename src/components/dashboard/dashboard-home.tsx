"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { formatDateShort } from "@/lib/utils";
import { EmptyState, PillButton } from "@/components/ui-kit";
import { useTheme } from "@/components/ThemeProvider";
import {
  ChartCard,
  CompactKpiCard,
  CompactTableCard,
  CostDonut,
  DarkCalendarCard,
  DarkInsightCard,
  DashboardShell,
  DashboardSkeleton,
  ForecastLine,
  HeroSummaryCard,
  ListCard,
  SearchPill,
  SegmentedModeToggle,
  ScheduleCard,
  type CompactProjectRow,
  type ListRow,
  type ScheduleItem,
} from "@/components/dashboard/super-dashboard";

type ProjectRow = {
  id: string;
  project_name: string;
  client_name: string;
  status: string;
  created_at: string;
  calc: {
    preco_recomendado?: number;
    margem_real_pct?: number;
  } | null;
  inputs: {
    margem_minima_pct?: number;
    itens?: Array<{ categoria?: string; quantidade?: number; preco_unitario?: number }>;
  } | null;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  created_at?: string;
};

type CallsheetRow = {
  id: string;
  created_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  crew: "Crew",
  equipamento: "Equipamento",
  pos_producao: "Pós",
  despesas: "Despesas",
  outro: "Outros",
};

function humanStatus(raw: string) {
  const value = (raw ?? "").toLowerCase();
  if (value === "rascunho" || value === "draft") return "Rascunho";
  if (value === "enviado" || value === "sent") return "Enviado";
  if (value === "aprovado" || value === "approved") return "Aprovado";
  if (value === "cancelado" || value === "cancelled") return "Cancelado";
  if (value === "arquivado" || value === "archived") return "Arquivado";
  if (value === "done") return "Done";
  if (value === "todo") return "Todo";
  return raw || "Ativo";
}

export default function DashboardHome() {
  const { dashboardMode, setDashboardMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [callsheets, setCallsheets] = useState<CallsheetRow[]>([]);

  const [clientsCount, setClientsCount] = useState(0);
  const [conversationsCount, setConversationsCount] = useState(0);
  const [callsheetsCount, setCallsheetsCount] = useState(0);
  const [routesCount, setRoutesCount] = useState(0);
  const [weatherCacheCount, setWeatherCacheCount] = useState(0);

  const [greetingName, setGreetingName] = useState("Daniel");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const sb = createClient();
      const { data: authData } = await sb.auth.getUser();
      const user = authData.user;
      const fallbackName = user?.email?.split("@")[0]?.split(".")[0] ?? "Daniel";
      const firstName = (user?.user_metadata?.first_name as string | undefined)
        ?? (user?.user_metadata?.name as string | undefined)?.split(" ")?.[0]
        ?? fallbackName;
      setGreetingName(firstName.charAt(0).toUpperCase() + firstName.slice(1));

      const [
        projectsRes,
        tasksRes,
        clientsRes,
        convRes,
        callsCountRes,
        callsListRes,
        routesRes,
        weatherRes,
      ] = await Promise.all([
        sb
          .from("projects")
          .select("id, project_name, client_name, status, created_at, calc, inputs")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(120),
        sb
          .from("tasks")
          .select("id, title, status, due_date, created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(120),
        sb.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null),
        sb.from("conversations").select("id", { count: "exact", head: true }),
        sb.from("call_sheets").select("id", { count: "exact", head: true }),
        sb
          .from("call_sheets")
          .select("id, created_at")
          .order("created_at", { ascending: false })
          .limit(8),
        sb.from("logistics_routes").select("id", { count: "exact", head: true }),
        sb.from("weather_cache").select("id", { count: "exact", head: true }),
      ]);

      if (projectsRes.error) throw new Error(projectsRes.error.message);
      if (tasksRes.error) throw new Error(tasksRes.error.message);
      if (clientsRes.error) throw new Error(clientsRes.error.message);

      setProjects((projectsRes.data ?? []) as ProjectRow[]);
      setTasks((tasksRes.data ?? []) as TaskRow[]);
      setCallsheets((callsListRes.data ?? []) as CallsheetRow[]);
      setClientsCount(clientsRes.count ?? 0);
      setConversationsCount(convRes.count ?? 0);
      setCallsheetsCount(callsCountRes.count ?? 0);
      setRoutesCount(routesRes.count ?? 0);
      setWeatherCacheCount(weatherRes.count ?? 0);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Erro ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const stats = useMemo(() => {
    const activeProjects = projects.length;
    const weeklyBudgets = projects.filter((project) => new Date(project.created_at).getTime() >= weekAgo).length;
    const openTasks = tasks.filter((task) => task.status !== "done").length;
    const pendingApprovals = projects.filter((project) => ["enviado", "sent"].includes((project.status || "").toLowerCase())).length;

    const realMargins = projects
      .map((project) => Number(project.calc?.margem_real_pct ?? 0))
      .filter((margin) => Number.isFinite(margin) && margin > 0);
    const avgMargin = realMargins.length > 0
      ? realMargins.reduce((sum, margin) => sum + margin, 0) / realMargins.length
      : 0;

    return {
      activeProjects,
      weeklyBudgets,
      leads: clientsCount,
      openTasks,
      pendingApprovals,
      avgMargin,
    };
  }, [projects, tasks, clientsCount, weekAgo]);

  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    const buildAdhocHref = (title: string, startsAt: Date, subtitle: string) => {
      const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
      const qs = new URLSearchParams({
        title,
        start: startsAt.toISOString(),
        end: endsAt.toISOString(),
        description: subtitle,
      });
      return `/api/calendar/event.ics?${qs.toString()}`;
    };

    const upcoming = tasks
      .filter((task) => task.status !== "done" && task.due_date)
      .sort((a, b) => new Date(a.due_date ?? "").getTime() - new Date(b.due_date ?? "").getTime())
      .slice(0, 6)
      .map((task, index) => {
        const date = new Date(task.due_date ?? "");
        const time = date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
        return {
          id: task.id,
          time,
          title: task.title,
          subtitle: `Deadline · ${formatDateShort(date.toISOString())}`,
          startsAt: date.toISOString(),
          calendarHref: `/api/calendar/event.ics?source=task&id=${task.id}`,
          active: index === 0,
        };
      });

    if (upcoming.length > 0) return upcoming;

    const baseDate = new Date();
    const placeholders = [
      { id: "ph-1", time: "09:00", title: "Kickoff Produção", subtitle: "Com equipa e cliente", active: true },
      { id: "ph-2", time: "11:00", title: "Revisão de Budget", subtitle: "Guardrails + margem" },
      { id: "ph-3", time: "14:30", title: "Follow-up Leads", subtitle: "Pipeline comercial" },
      { id: "ph-4", time: "16:00", title: "Feedback Entregas", subtitle: "Aprovações pendentes" },
    ];

    return placeholders.map((item) => {
      const [h, m] = item.time.split(":").map(Number);
      const start = new Date(baseDate);
      start.setHours(h, m, 0, 0);
      return {
        ...item,
        startsAt: start.toISOString(),
        calendarHref: buildAdhocHref(item.title, start, item.subtitle),
      };
    });
  }, [tasks]);

  const tableRows = useMemo<CompactProjectRow[]>(() => {
    return projects.slice(0, 8).map((project) => ({
      id: project.id,
      name: project.project_name,
      owner: project.client_name || "Sem cliente",
      status: humanStatus(project.status),
      value: Number(project.calc?.preco_recomendado ?? 0),
    }));
  }, [projects]);

  const alerts = useMemo(() => {
    const next: Array<{ level: "ok" | "warn"; text: string }> = [];

    for (const project of projects.slice(0, 12)) {
      const minMargin = Number(project.inputs?.margem_minima_pct ?? 0);
      const realMargin = Number(project.calc?.margem_real_pct ?? 0);
      if (minMargin > 0 && realMargin > 0 && realMargin < minMargin) {
        next.push({ level: "warn", text: `${project.project_name}: margem ${realMargin.toFixed(1)}% abaixo do mínimo ${minMargin}%` });
      }

      if (["enviado", "sent"].includes((project.status || "").toLowerCase())) {
        const age = (now - new Date(project.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (age > 7) {
          next.push({ level: "warn", text: `${project.project_name}: enviado há ${Math.round(age)} dias sem decisão` });
        }
      }
    }

    if (stats.openTasks > 18) {
      next.push({ level: "warn", text: `${stats.openTasks} tarefas em aberto — risco de atraso operacional` });
    }

    if (next.length === 0) {
      next.push({ level: "ok", text: "Margens e pipeline estão dentro do esperado." });
    }

    return next;
  }, [projects, now, stats.openTasks]);

  const forecastData = useMemo(() => {
    const buckets: Array<{ month: string; value: number }> = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setMonth(date.getMonth() - offset, 1);
      const month = date.toLocaleDateString("en-US", { month: "short" });
      const value = projects
        .filter((project) => {
          const created = new Date(project.created_at);
          return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth();
        })
        .reduce((sum, project) => sum + Number(project.calc?.preco_recomendado ?? 0), 0);

      buckets.push({ month, value });
    }
    return buckets;
  }, [projects]);

  const donutData = useMemo(() => {
    const totals = new Map<string, number>();

    for (const project of projects.slice(0, 30)) {
      for (const item of project.inputs?.itens ?? []) {
        const category = item.categoria ?? "outro";
        const quantity = Number(item.quantidade ?? 0);
        const unit = Number(item.preco_unitario ?? 0);
        const total = quantity * unit;
        totals.set(category, (totals.get(category) ?? 0) + total);
      }
    }

    const normalized = [...totals.entries()]
      .filter(([, value]) => value > 0)
      .map(([category, value]) => ({ name: CATEGORY_LABELS[category] ?? category, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);

    if (normalized.length > 0) return normalized;

    return [
      { name: "Crew", value: 4200 },
      { name: "Equipamento", value: 2800 },
      { name: "Pós", value: 1700 },
      { name: "Despesas", value: 900 },
    ];
  }, [projects]);

  const pipelineRows = useMemo<ListRow[]>(() => {
    const buckets = new Map<string, number>();
    for (const project of projects) {
      const status = humanStatus(project.status);
      buckets.set(status, (buckets.get(status) ?? 0) + 1);
    }

    return [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([status, count], index) => ({
        id: `${status}-${index}`,
        title: status,
        subtitle: `${count} projetos`,
        status: count > 5 ? "Hot" : "Normal",
      }));
  }, [projects]);

  const inboxRows = useMemo<ListRow[]>(() => {
    const q = search.trim().toLowerCase();
    const fromProjects = projects.map((project) => ({
      id: project.id,
      title: project.project_name,
      subtitle: `${project.client_name || "Sem cliente"} · ${formatDateShort(project.created_at)}`,
      status: humanStatus(project.status),
      ctaHref: `/app/projects/${project.id}`,
      ctaLabel: "Open",
    }));

    const fromTasks = tasks.map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      subtitle: task.due_date ? `Task · ${formatDateShort(task.due_date)}` : "Task sem deadline",
      status: humanStatus(task.status),
      ctaHref: "/app/tasks",
      ctaLabel: "Reply",
    }));

    const rows = [...fromProjects.slice(0, 4), ...fromTasks.slice(0, 3)];

    if (!q) return rows;
    return rows.filter((row) => row.title.toLowerCase().includes(q) || (row.subtitle ?? "").toLowerCase().includes(q));
  }, [projects, search, tasks]);

  const tasksTodayRows = useMemo<ListRow[]>(() => {
    const top = tasks
      .filter((task) => task.status !== "done")
      .sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        return ad - bd;
      })
      .slice(0, 5);

    if (top.length === 0) {
      return [{ id: "placeholder", title: "Sem tarefas críticas", subtitle: "A equipa está em dia.", status: "OK" }];
    }

    return top.map((task) => ({
      id: task.id,
      title: task.title,
      subtitle: task.due_date ? `Prazo ${formatDateShort(task.due_date)}` : "Sem prazo",
      status: humanStatus(task.status),
      ctaHref: "/app/tasks",
      ctaLabel: "Ver",
    }));
  }, [tasks]);

  const callsheetRows = useMemo<ListRow[]>(() => {
    if (callsheets.length === 0) {
      return [{ id: "empty-calls", title: "Sem call sheets recentes", subtitle: "Cria um call sheet para a operação." }];
    }

    return callsheets.map((sheet, index) => ({
      id: sheet.id,
      title: `Call Sheet #${String(index + 1).padStart(2, "0")}`,
      subtitle: `Atualizado ${formatDateShort(sheet.created_at)}`,
      ctaHref: "/app/callsheets",
      ctaLabel: "Abrir",
    }));
  }, [callsheets]);

  const companyOpsRows = useMemo<ListRow[]>(() => {
    return [
      {
        id: "routes",
        title: "Rotas logísticas",
        subtitle: `${routesCount} registos`,
        status: routesCount > 0 ? "OK" : "Setup",
        ctaHref: "/app/logistics",
        ctaLabel: "Ver",
      },
      {
        id: "weather",
        title: "Weather cache",
        subtitle: `${weatherCacheCount} entradas`,
        status: weatherCacheCount > 10 ? "Fresh" : "Low",
        ctaHref: "/app/weather",
        ctaLabel: "Abrir",
      },
      {
        id: "approvals",
        title: "Aprovações pendentes",
        subtitle: `${stats.pendingApprovals} projetos`,
        status: stats.pendingApprovals > 0 ? "Warn" : "OK",
        ctaHref: "/app/projects",
        ctaLabel: "Rever",
      },
      {
        id: "inbox",
        title: "Conversas ativas",
        subtitle: `${conversationsCount} threads`,
        status: conversationsCount > 0 ? "Live" : "Empty",
        ctaHref: "/app/inbox",
        ctaLabel: "Inbox",
      },
    ];
  }, [conversationsCount, routesCount, stats.pendingApprovals, weatherCacheCount]);

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[0.72rem] uppercase tracking-[0.12em]" style={{ color: "var(--text-3)" }}>
          {dashboardMode === "ceo" ? "CEO Dashboard" : "Empresa Dashboard"}
        </p>
        <h2 className="mt-1.5 text-[2rem] font-[540] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
          Hi, {greetingName}!
        </h2>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          {dashboardMode === "ceo"
            ? "Visão premium, calma e estratégica para decisões de negócio."
            : "Vista operacional para execução diária e controlo de produção."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchPill value={search} onChange={setSearch} placeholder="Pesquisar updates" />
        <SegmentedModeToggle mode={dashboardMode} onChange={setDashboardMode} />
      </div>
    </div>
  );

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (loadError) {
    return (
      <div className="card">
        <EmptyState
          title="Erro ao carregar dashboard"
          description={loadError}
          action={
            <PillButton className="px-4 py-2 text-xs" onClick={() => void load()}>
              Retry
            </PillButton>
          }
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
      className="space-y-6"
    >
      <DashboardShell header={header}>
        {dashboardMode === "ceo" ? (
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-12">
            <div className="lg:col-span-1 xl:col-span-8">
              <HeroSummaryCard
                greeting={`Hi, ${greetingName}!`}
                subtitle="Resumo de hoje com foco em pipeline, risco e execução sem ruído operacional."
                metrics={[
                  { id: "projects", label: "Orçamentos ativos", value: String(stats.activeProjects), hint: `${stats.weeklyBudgets} novos esta semana`, tone: "blue" },
                  { id: "approvals", label: "Aprovações pendentes", value: String(stats.pendingApprovals), hint: "Aguardam resposta", tone: "yellow" },
                  { id: "critical", label: "Tarefas críticas", value: String(stats.openTasks), hint: "Necessitam follow-up", tone: "lilac" },
                  { id: "leads", label: "Leads quentes", value: String(stats.leads), hint: "Clientes ativos", tone: "mint" },
                ]}
                primaryCta={{ href: "/app/projects/new", label: "Novo Projeto" }}
                secondaryCta={{ href: "/app/projects/new", label: "Novo Orçamento" }}
              />
            </div>

            <div className="lg:col-span-1 xl:col-span-4">
              <DarkCalendarCard events={scheduleItems} feedHref="/api/calendar/feed.ics" />
            </div>

            <div className="lg:col-span-1 xl:col-span-4">
              <ChartCard title="Forecast" subtitle="Receita projetada">
                <ForecastLine data={forecastData} />
              </ChartCard>
            </div>

            <div className="lg:col-span-1 xl:col-span-3">
              <ListCard title="Pipeline" subtitle="Hot / Follow-up / Waiting" rows={pipelineRows} />
            </div>

            <div className="lg:col-span-2 xl:col-span-5">
              <ListCard title="Inbox / Updates" subtitle="5 itens mais recentes" rows={inboxRows} />
            </div>

            <div className="lg:col-span-1 xl:col-span-7">
              <ScheduleCard items={scheduleItems.slice(0, 5)} />
            </div>

            <div className="lg:col-span-1 xl:col-span-5">
              <DarkInsightCard alerts={alerts} />
            </div>

            <div className="lg:col-span-1 xl:col-span-6">
              <ChartCard title="Composição de Custos" subtitle="Distribuição por categoria">
                <CostDonut data={donutData} />
              </ChartCard>
            </div>

            <div className="lg:col-span-1 xl:col-span-6">
              <ListCard title="Tarefas do dia" subtitle="Top 5 por prioridade de prazo" rows={tasksTodayRows} />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <CompactKpiCard label="Projetos ativos" value={String(stats.activeProjects)} hint="Operação em curso" />
              <CompactKpiCard label="Entregas semana" value={String(callsheetsCount)} hint="Call sheets e entregas" />
              <CompactKpiCard label="Backlog" value={String(stats.openTasks)} hint="Tarefas abertas" />
              <CompactKpiCard label="Margem média" value={`${stats.avgMargin.toFixed(1)}%`} hint="Projetos recentes" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-12">
              <div className="lg:col-span-1 xl:col-span-4">
                <ListCard title="Callsheets recentes" subtitle="Últimas operações" rows={callsheetRows} />
              </div>

              <div className="lg:col-span-1 xl:col-span-4">
                <ListCard title="Logística / Weather" subtitle="Estado técnico" rows={companyOpsRows} />
              </div>

              <div className="lg:col-span-2 xl:col-span-4">
                <DarkInsightCard alerts={alerts} />
              </div>

              <div className="lg:col-span-2 xl:col-span-7">
                <CompactTableCard rows={tableRows} />
              </div>

              <div className="lg:col-span-1 xl:col-span-5">
                <ChartCard title="Forecast operacional" subtitle="Volume mensal">
                  <ForecastLine data={forecastData} />
                </ChartCard>
              </div>

              <div className="lg:col-span-1 xl:col-span-5">
                <ChartCard title="Mix de custos" subtitle="Custos dos projetos ativos">
                  <CostDonut data={donutData} />
                </ChartCard>
              </div>

              <div className="lg:col-span-1 xl:col-span-7">
                <ListCard title="Aprovações e conversas" subtitle="Follow-up em progresso" rows={inboxRows} />
              </div>
            </div>
          </div>
        )}
      </DashboardShell>
    </motion.div>
  );
}
