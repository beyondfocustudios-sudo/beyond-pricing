"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGroup } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { formatDateShort } from "@/lib/utils";
import { EmptyState, PillButton } from "@/components/ui-kit";
import { useTheme } from "@/components/ThemeProvider";
import { MotionList, MotionListItem, MotionPage } from "@/components/motion-system";
import {
  CompactKpiCard,
  CompactTableCard,
  DarkCalendarCard,
  DashboardShell,
  DashboardSkeleton,
  HeroSummaryCard,
  ListCard,
  SegmentedModeToggle,
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

type CalendarEventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
};

function humanStatus(raw: string) {
  const value = (raw ?? "").toLowerCase();
  if (value === "rascunho" || value === "draft") return "Rascunho";
  if (value === "enviado" || value === "sent") return "Enviado";
  if (value === "in_review") return "Em revisão";
  if (value === "aprovado" || value === "approved") return "Aprovado";
  if (value === "cancelado" || value === "cancelled") return "Cancelado";
  if (value === "arquivado" || value === "archived") return "Arquivado";
  if (value === "done") return "Done";
  if (value === "todo") return "Todo";
  return raw || "Ativo";
}

function isMissingCalendarTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return /calendar_events|does not exist|schema cache/i.test(message);
}

function MobileAccordionSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--border-soft)", background: "color-mix(in srgb, var(--surface) 92%, transparent)" }}
    >
      <summary
        className="cursor-pointer list-none px-4 py-3 text-sm font-semibold"
        style={{ color: "var(--text)" }}
      >
        {title}
      </summary>
      <div className="space-y-3 px-3 pb-3">{children}</div>
    </details>
  );
}

export default function DashboardHome() {
  const searchParams = useSearchParams();
  const { dashboardMode, setDashboardMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [callsheets, setCallsheets] = useState<CallsheetRow[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventRow[]>([]);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    location: "",
    startsAt: "",
    endsAt: "",
  });

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
        calendarEventsRes,
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
        sb
          .from("calendar_events")
          .select("id, title, description, location, starts_at, ends_at")
          .is("deleted_at", null)
          .order("starts_at", { ascending: true })
          .limit(40),
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
      if (!calendarEventsRes.error) {
        setCalendarEvents((calendarEventsRes.data ?? []) as CalendarEventRow[]);
      } else if (isMissingCalendarTable(calendarEventsRes.error)) {
        setCalendarEvents([]);
      } else {
        throw new Error(calendarEventsRes.error.message);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Erro ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const search = (searchParams.get("q") ?? "").trim().toLowerCase();

  const openEventModal = useCallback(() => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const toLocalDateTime = (value: Date) => {
      const offsetMs = value.getTimezoneOffset() * 60_000;
      return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
    };

    setEventForm({
      title: "",
      description: "",
      location: "",
      startsAt: toLocalDateTime(start),
      endsAt: toLocalDateTime(end),
    });
    setEventError(null);
    setEventModalOpen(true);
  }, []);

  const createCalendarEvent = useCallback(async () => {
    if (!eventForm.title.trim()) {
      setEventError("Título é obrigatório.");
      return;
    }
    if (!eventForm.startsAt || !eventForm.endsAt) {
      setEventError("Define início e fim do evento.");
      return;
    }

    const start = new Date(eventForm.startsAt);
    const end = new Date(eventForm.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setEventError("Datas inválidas. O fim deve ser depois do início.");
      return;
    }

    setEventSaving(true);
    setEventError(null);

    try {
      const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: eventForm.title.trim(),
          description: eventForm.description.trim() || null,
          location: eventForm.location.trim() || null,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          timezone: "Europe/Lisbon",
          type: "meeting",
          status: "confirmed",
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        event?: CalendarEventRow;
      };

      if (!response.ok) {
        setEventError(payload.error ?? "Não foi possível criar o evento.");
      } else if (payload.event) {
        setCalendarEvents((current) =>
          [...current, payload.event as CalendarEventRow].sort(
            (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
          ),
        );
        setEventModalOpen(false);
      }
    } catch {
      setEventError("Não foi possível criar o evento.");
    } finally {
      setEventSaving(false);
    }
  }, [eventForm]);

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const stats = useMemo(() => {
    const activeProjects = projects.length;
    const weeklyBudgets = projects.filter((project) => new Date(project.created_at).getTime() >= weekAgo).length;
    const openTasks = tasks.filter((task) => task.status !== "done").length;
    const pendingApprovals = projects.filter((project) => ["enviado", "sent", "in_review"].includes((project.status || "").toLowerCase())).length;

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

    const buildGoogleHref = (title: string, startsAt: Date, subtitle: string) => {
      const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
      const toGoogleDate = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
      const qs = new URLSearchParams({
        action: "TEMPLATE",
        text: title,
        dates: `${toGoogleDate(startsAt)}/${toGoogleDate(endsAt)}`,
        details: subtitle,
      });
      return `https://calendar.google.com/calendar/render?${qs.toString()}`;
    };

    const upcomingEvents = calendarEvents
      .filter((event) => !event.starts_at || new Date(event.ends_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
      .slice(0, 6)
      .map((event, index) => {
        const start = new Date(event.starts_at);
        return {
          id: event.id,
          time: start.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
          title: event.title,
          subtitle: event.location?.trim()
            ? `${event.location} · ${formatDateShort(event.starts_at)}`
            : formatDateShort(event.starts_at),
          startsAt: event.starts_at,
          calendarHref: `/api/calendar/event.ics?id=${event.id}`,
          googleHref: buildGoogleHref(
            event.title,
            start,
            event.description ?? event.location ?? "Evento do Beyond Pricing",
          ),
          active: index === 0,
        } satisfies ScheduleItem;
      });

    if (upcomingEvents.length > 0) return upcomingEvents;

    const fallbackTasks = tasks
      .filter((task) => task.status !== "done" && task.due_date)
      .sort((a, b) => new Date(a.due_date ?? "").getTime() - new Date(b.due_date ?? "").getTime())
      .slice(0, 6)
      .map((task, index) => {
        const date = new Date(task.due_date ?? "");
        return {
          id: `task-${task.id}`,
          time: date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
          title: task.title,
          subtitle: `Deadline · ${formatDateShort(date.toISOString())}`,
          startsAt: date.toISOString(),
          calendarHref: buildAdhocHref(task.title, date, `Deadline · ${formatDateShort(date.toISOString())}`),
          googleHref: buildGoogleHref(task.title, date, `Deadline · ${formatDateShort(date.toISOString())}`),
          active: index === 0,
        } satisfies ScheduleItem;
      });

    if (fallbackTasks.length > 0) return fallbackTasks;

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
        googleHref: buildGoogleHref(item.title, start, item.subtitle),
      };
    });
  }, [calendarEvents, tasks]);

  const tableRows = useMemo<CompactProjectRow[]>(() => {
    return projects.slice(0, 8).map((project) => ({
      id: project.id,
      name: project.project_name,
      owner: project.client_name || "Sem cliente",
      status: humanStatus(project.status),
      value: Number(project.calc?.preco_recomendado ?? 0),
    }));
  }, [projects]);

  const projectListRows = useMemo<ListRow[]>(() => {
    return tableRows.slice(0, 5).map((row) => ({
      id: row.id,
      title: row.name,
      subtitle: row.owner,
      status: row.status,
      ctaHref: `/app/projects/${row.id}`,
      ctaLabel: "Abrir",
    }));
  }, [tableRows]);

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
    const q = search;
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div>
        <p className="text-[0.72rem] uppercase tracking-[0.12em]" style={{ color: "var(--text-3)" }}>
          {dashboardMode === "ceo" ? "CEO Mode" : "Empresa Mode"}
        </p>
        <h2 className="mt-1.5 text-[1.15rem] font-[540] tracking-[-0.02em]" style={{ color: "var(--text)" }}>
          {dashboardMode === "ceo" ? "Dashboard" : "Operação"}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
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

  const ceoDesktopLayout = (
    <MotionList className="grid gap-6 lg:grid-cols-2 xl:grid-cols-12">
      <MotionListItem className="xl:col-span-12">
        <HeroSummaryCard
          greeting={`Olá, ${greetingName}`}
          subtitle="Resumo do dia: pipeline, risco e execução."
          metrics={[
            { id: "projects", label: "Orçamentos ativos", value: String(stats.activeProjects), hint: `${stats.weeklyBudgets} novos esta semana`, tone: "blue" },
            { id: "approvals", label: "Aprovações pendentes", value: String(stats.pendingApprovals), hint: "Aguardam resposta", tone: "yellow" },
            { id: "critical", label: "Tarefas críticas", value: String(stats.openTasks), hint: "Necessitam follow-up", tone: "lilac" },
            { id: "leads", label: "Leads quentes", value: String(stats.leads), hint: "Clientes ativos", tone: "mint" },
          ]}
          primaryCta={{ href: "/app/projects/new", label: "Novo Projeto" }}
        />
      </MotionListItem>

      <MotionListItem className="grid content-start gap-6 lg:col-span-1 xl:col-span-4">
        <section className="super-card">
          <p className="text-[0.68rem] uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>
            Today
          </p>
          <h3 className="mt-1 text-lg font-semibold" style={{ color: "var(--text)" }}>
            {new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long" })}
          </h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
            Quick actions para manter a operação em movimento.
          </p>
          <div className="mt-4 grid gap-2">
            <Link href="/app/tasks" className="pill-tab">
              Abrir tarefas
            </Link>
            <Link href="/app/inbox" className="pill-tab">
              Ver inbox
            </Link>
            <Link href="/app/projects" className="pill-tab">
              Projetos ativos
            </Link>
          </div>
        </section>

        <ListCard title="My tasks" subtitle="Prioridades de hoje" rows={tasksTodayRows} href="/app/tasks" />
        <ListCard title="Inbox preview" subtitle="Updates mais recentes" rows={inboxRows} href="/app/inbox" />
      </MotionListItem>

      <MotionListItem className="grid content-start gap-6 lg:col-span-1 xl:col-span-5">
        <CompactTableCard rows={tableRows} href="/app/projects" />
      </MotionListItem>

      <MotionListItem className="grid content-start gap-6 lg:col-span-2 xl:col-span-3">
        <DarkCalendarCard
          events={scheduleItems}
          feedHref="/api/calendar/feed.ics"
          href="/app/calendar"
          onCreateEvent={openEventModal}
        />
      </MotionListItem>
    </MotionList>
  );

  const companyDesktopLayout = (
    <MotionList className="grid gap-6 lg:grid-cols-2 xl:grid-cols-12">
      <MotionListItem className="grid content-start gap-6 lg:col-span-1 xl:col-span-4">
        <ListCard title="Projetos em curso" subtitle="Visão rápida operacional" rows={projectListRows} href="/app/projects" />
        <ListCard title="Próximas deadlines" subtitle="Tarefas com prazo próximo" rows={tasksTodayRows} href="/app/tasks" />
      </MotionListItem>

      <MotionListItem className="grid content-start gap-6 lg:col-span-1 xl:col-span-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <CompactKpiCard label="Projetos ativos" value={String(stats.activeProjects)} hint="Operação em curso" />
          <CompactKpiCard label="Entregas semana" value={String(callsheetsCount)} hint="Call sheets e entregas" />
          <CompactKpiCard label="Backlog" value={String(stats.openTasks)} hint="Tarefas abertas" />
          <CompactKpiCard label="Margem média" value={`${stats.avgMargin.toFixed(1)}%`} hint="Projetos recentes" />
        </div>
        <CompactTableCard rows={tableRows} href="/app/projects" />
        <ListCard title="Pipeline / CRM snapshot" subtitle="Estado comercial e follow-up" rows={pipelineRows} />
      </MotionListItem>

      <MotionListItem className="grid content-start gap-6 lg:col-span-2 xl:col-span-3">
        <ListCard title="Entregas em revisão" subtitle="Últimos call sheets" rows={callsheetRows} href="/app/callsheets" />
        <DarkCalendarCard
          events={scheduleItems}
          feedHref="/api/calendar/feed.ics"
          href="/app/calendar"
          onCreateEvent={openEventModal}
        />
        <ListCard title="Operação Empresa" subtitle="Tempo, rotas, approvals e inbox" rows={companyOpsRows} href="/app/insights" />
      </MotionListItem>
    </MotionList>
  );

  const ceoMobileLayout = (
    <div className="space-y-3">
      <MobileAccordionSection title="Resumo CEO">
        <HeroSummaryCard
          greeting={`Olá, ${greetingName}`}
          subtitle="Resumo do dia: pipeline, risco e execução."
          metrics={[
            { id: "projects-m", label: "Orçamentos", value: String(stats.activeProjects), hint: `${stats.weeklyBudgets} esta semana`, tone: "blue" },
            { id: "approvals-m", label: "Aprovações", value: String(stats.pendingApprovals), hint: "Pendentes", tone: "yellow" },
            { id: "tasks-m", label: "Tarefas", value: String(stats.openTasks), hint: "Em aberto", tone: "lilac" },
            { id: "leads-m", label: "Leads", value: String(stats.leads), hint: "Ativos", tone: "mint" },
          ]}
          primaryCta={{ href: "/app/projects/new", label: "Novo Projeto" }}
        />
      </MobileAccordionSection>

      <MobileAccordionSection title="Today / Quick actions" defaultOpen={false}>
        <ListCard title="My tasks" rows={tasksTodayRows} href="/app/tasks" />
        <ListCard title="Inbox preview" rows={inboxRows} href="/app/inbox" />
      </MobileAccordionSection>

      <MobileAccordionSection title="Calendário" defaultOpen={false}>
        <DarkCalendarCard
          events={scheduleItems}
          feedHref="/api/calendar/feed.ics"
          href="/app/calendar"
          onCreateEvent={openEventModal}
        />
      </MobileAccordionSection>
    </div>
  );

  const companyMobileLayout = (
    <div className="space-y-3">
      <MobileAccordionSection title="Operação Empresa">
        <div className="grid grid-cols-2 gap-3">
          <CompactKpiCard label="Projetos" value={String(stats.activeProjects)} hint="Ativos" />
          <CompactKpiCard label="Entregas" value={String(callsheetsCount)} hint="Semana" />
          <CompactKpiCard label="Backlog" value={String(stats.openTasks)} hint="Abertas" />
          <CompactKpiCard label="Margem" value={`${stats.avgMargin.toFixed(1)}%`} hint="Média" />
        </div>
      </MobileAccordionSection>

      <MobileAccordionSection title="Projetos e Deadlines" defaultOpen={false}>
        <ListCard title="Projetos em curso" rows={projectListRows} href="/app/projects" />
        <ListCard title="Próximas deadlines" rows={tasksTodayRows} href="/app/tasks" />
      </MobileAccordionSection>

      <MobileAccordionSection title="Calendário e Operação" defaultOpen={false}>
        <ListCard title="Entregas em revisão" rows={callsheetRows} href="/app/callsheets" />
        <DarkCalendarCard
          events={scheduleItems}
          feedHref="/api/calendar/feed.ics"
          href="/app/calendar"
          onCreateEvent={openEventModal}
        />
        <ListCard title="Operação Empresa" rows={companyOpsRows} href="/app/insights" />
      </MobileAccordionSection>
    </div>
  );

  return (
    <MotionPage className="space-y-6 pb-28 md:pb-8">
      <LayoutGroup id="dashboard-mode-layout">
        <DashboardShell header={header}>
          <div className="space-y-6">
            <div className="md:hidden">
              {dashboardMode === "ceo" ? ceoMobileLayout : companyMobileLayout}
            </div>
            <div className="hidden md:block">
              {dashboardMode === "ceo" ? ceoDesktopLayout : companyDesktopLayout}
            </div>
          </div>
        </DashboardShell>
      </LayoutGroup>

      {eventModalOpen ? (
        <div className="modal-overlay">
          <div className="modal-content max-w-lg">
            <div className="modal-header">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Novo evento
              </h3>
            </div>
            <div className="modal-body space-y-3">
              <div>
                <label className="label">Título</label>
                <input
                  className="input"
                  value={eventForm.title}
                  onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Ex: Reunião com cliente"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Início</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={eventForm.startsAt}
                    onChange={(event) => setEventForm((current) => ({ ...current, startsAt: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Fim</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={eventForm.endsAt}
                    onChange={(event) => setEventForm((current) => ({ ...current, endsAt: event.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label">Local</label>
                <input
                  className="input"
                  value={eventForm.location}
                  onChange={(event) => setEventForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Ex: Lisboa"
                />
              </div>
              <div>
                <label className="label">Descrição</label>
                <textarea
                  className="input min-h-[88px]"
                  value={eventForm.description}
                  onChange={(event) => setEventForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Detalhes opcionais do evento"
                />
              </div>
              {eventError ? (
                <p className="text-xs" style={{ color: "var(--error)" }}>
                  {eventError}
                </p>
              ) : null}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setEventModalOpen(false)} disabled={eventSaving}>
                Cancelar
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => void createCalendarEvent()} disabled={eventSaving}>
                {eventSaving ? "A guardar..." : "Guardar evento"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </MotionPage>
  );
}
