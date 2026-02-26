"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  CalendarDays,
  Download,
  Flag,
  MessageSquare,
  Package,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  getClientProjects,
  getConversationForProject,
  getMessages,
  getProjectDeliverables,
  getProjectMilestones,
  type PortalDeliverable,
  type PortalMessage,
  type PortalMilestone,
  type PortalProject,
} from "@/lib/portal-data";
import { buttonMotionProps, useMotionEnabled, variants } from "@/lib/motion";

type CalendarView = "milestones" | "timeline" | "tasks";

type RequestRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  created_at: string;
};

type UpdateItem = {
  id: string;
  kind: "message" | "review" | "delivery";
  title: string;
  subtitle: string;
  createdAt: string;
  href: string;
};

const timelineSpring = { type: "spring", stiffness: 290, damping: 28, mass: 0.85 } as const;

function toIsoRange(dateString: string | null) {
  if (!dateString) {
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  const start = new Date(dateString);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function buildGoogleLink(title: string, startIso: string, endIso: string, details?: string) {
  const start = new Date(startIso).toISOString().replace(/[-:]/g, "").replace(".000", "");
  const end = new Date(endIso).toISOString().replace(/[-:]/g, "").replace(".000", "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
  });
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toIcsLink(title: string, startIso: string, endIso: string, description?: string) {
  const params = new URLSearchParams({ title, start: startIso, end: endIso });
  if (description) params.set("description", description);
  return `/api/calendar/event.ics?${params.toString()}`;
}

function milestoneType(milestone: PortalMilestone) {
  const title = milestone.title.toLowerCase();
  if (title.includes("kickoff")) return "kickoff";
  if (title.includes("shoot") || title.includes("rodagem")) return "shoot day";
  if (title.includes("v1")) return "delivery v1";
  if (title.includes("v2")) return "delivery v2";
  if (title.includes("final")) return "final";
  if (milestone.phase === "pre_producao") return "kickoff";
  if (milestone.phase === "rodagem") return "shoot day";
  if (milestone.phase === "pos_producao") return "delivery";
  return "milestone";
}

function milestoneState(status: string | null) {
  const normalized = (status ?? "pending").toLowerCase();
  if (normalized === "done") {
    return { label: "done", tone: "rgba(22,163,74,0.16)", color: "#15803d" };
  }
  if (normalized === "blocked" || normalized === "at-risk") {
    return { label: "at-risk", tone: "rgba(220,38,38,0.14)", color: "#b91c1c" };
  }
  return { label: "pending", tone: "rgba(245,158,11,0.18)", color: "#92400e" };
}

function formatDate(dateString: string | null) {
  if (!dateString) return "Sem data";
  return new Date(dateString).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PortalCalendarPage() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const motionEnabled = useMotionEnabled();

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [view, setView] = useState<CalendarView>("milestones");
  const [selectedMilestone, setSelectedMilestone] = useState<PortalMilestone | null>(null);

  const [milestones, setMilestones] = useState<PortalMilestone[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [deliveries, setDeliveries] = useState<PortalDeliverable[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadProjects = async () => {
      setLoadingProjects(true);
      setError(null);
      try {
        const list = await getClientProjects();
        if (cancelled) return;
        setProjects(list);
        setSelectedProjectId((previous) => previous || list[0]?.id || "");
      } catch {
        if (!cancelled) setError("Falha ao carregar projetos.");
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    };
    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    let cancelled = false;

    const loadProjectData = async () => {
      setLoadingDetail(true);
      setError(null);
      try {
        const [milestoneRows, deliveryRows, conversationId, requestRes] = await Promise.all([
          getProjectMilestones(selectedProjectId),
          getProjectDeliverables(selectedProjectId),
          getConversationForProject(selectedProjectId),
          fetch(`/api/portal/requests?projectId=${encodeURIComponent(selectedProjectId)}`, { cache: "no-store" }),
        ]);

        const messageRows = conversationId ? await getMessages(conversationId) : [];
        const requestRows = requestRes.ok
          ? ((await requestRes.json().catch(() => [])) as RequestRow[])
          : [];

        if (cancelled) return;

        setMilestones(
          milestoneRows.sort((a, b) => {
            const dateA = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
            const dateB = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
            return dateA - dateB;
          }),
        );
        setDeliveries(deliveryRows);
        setMessages(messageRows);
        setRequests(requestRows);
      } catch {
        if (!cancelled) setError("Falha ao carregar timeline do projeto.");
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };

    void loadProjectData();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const filteredProjects = useMemo(() => {
    if (!query) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(query));
  }, [projects, query]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const updates = useMemo<UpdateItem[]>(() => {
    if (!selectedProjectId) return [];
    const messageUpdates = messages.slice(-8).map((message) => ({
      id: `msg-${message.id}`,
      kind: "message" as const,
      title: message.body.slice(0, 72),
      subtitle: "Mensagem",
      createdAt: message.created_at,
      href: `/portal/projects/${selectedProjectId}?tab=inbox&highlight=msg-${message.id}`,
    }));

    const reviewUpdates = requests.slice(0, 8).map((request) => ({
      id: `request-${request.id}`,
      kind: "review" as const,
      title: request.title,
      subtitle: `Review • ${request.priority}`,
      createdAt: request.created_at,
      href: `/portal/projects/${selectedProjectId}?tab=approvals&highlight=request-${request.id}`,
    }));

    const deliveryUpdates = deliveries.slice(0, 8).map((delivery) => ({
      id: `delivery-${delivery.id}`,
      kind: "delivery" as const,
      title: delivery.title,
      subtitle: "Entrega publicada",
      createdAt: delivery.created_at,
      href: `/portal/projects/${selectedProjectId}?tab=deliveries&selected=${delivery.id}`,
    }));

    return [...messageUpdates, ...reviewUpdates, ...deliveryUpdates].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [messages, requests, deliveries, selectedProjectId]);

  const taskRows = useMemo(() => {
    const pendingMilestones = milestones
      .filter((milestone) => (milestone.status ?? "pending") !== "done")
      .map((milestone) => ({
        id: `milestone-${milestone.id}`,
        title: milestone.title,
        subtitle: `Milestone • ${milestoneType(milestone)}`,
        dueDate: milestone.due_date,
      }));

    const requestTasks = requests.map((request) => ({
      id: `request-${request.id}`,
      title: request.title,
      subtitle: `Pedido • ${request.priority}`,
      dueDate: null,
    }));

    return [...pendingMilestones, ...requestTasks];
  }, [milestones, requests]);

  if (loadingProjects) return <div className="skeleton h-[74vh] rounded-3xl" />;

  if (error) {
    return (
      <div className="card p-6">
        <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
        <button className="btn btn-secondary mt-3" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <LayoutGroup>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <motion.section
          layout
          variants={variants.cardEnter}
          initial={motionEnabled ? "initial" : false}
          animate="animate"
          className="card min-h-[68vh] p-4 lg:h-[calc(100dvh-180px)] lg:overflow-y-auto"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h1 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Projects</h1>
            <span className="pill text-[11px]">{filteredProjects.length}</span>
          </div>

          <label className="table-search-pill mb-3">
            <Search className="h-3.5 w-3.5" />
            <input readOnly value={query} placeholder="Usa a pesquisa no topo" />
          </label>

          <div className="space-y-2">
            {filteredProjects.map((project) => {
              const active = project.id === selectedProjectId;
              return (
                <motion.button
                  key={project.id}
                  layoutId={`portal-project-${project.id}`}
                  layout
                  onClick={() => setSelectedProjectId(project.id)}
                  className="w-full rounded-2xl border p-3 text-left"
                  style={{
                    borderColor: active ? "rgba(26,143,163,0.35)" : "var(--border)",
                    background: active ? "rgba(26,143,163,0.10)" : "var(--surface)",
                  }}
                  transition={timelineSpring}
                  {...buttonMotionProps({ enabled: motionEnabled, hoverY: -1 })}
                >
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{project.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>
                    {project.status ?? "active"} • {new Date(project.updated_at).toLocaleDateString("pt-PT")}
                  </p>
                </motion.button>
              );
            })}
          </div>

          {filteredProjects.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed p-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
              Sem projetos para este filtro.
            </p>
          ) : null}
        </motion.section>

        <motion.section
          layout
          variants={variants.cardEnter}
          initial={motionEnabled ? "initial" : false}
          animate="animate"
          className="card min-w-0 min-h-[68vh] p-5 lg:h-[calc(100dvh-180px)] lg:overflow-hidden"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>Calendarização</p>
              <h2 className="truncate text-[1.15rem] font-semibold" style={{ color: "var(--text)" }}>
                {selectedProject?.name ?? "Seleciona um projeto"}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["milestones", "timeline", "tasks"] as CalendarView[]).map((item) => (
                <motion.button
                  key={item}
                  onClick={() => setView(item)}
                  className="pill px-3 py-1.5 text-xs capitalize"
                  style={{
                    background: view === item ? "rgba(26,143,163,0.16)" : "var(--surface-2)",
                    color: view === item ? "var(--accent-blue)" : "var(--text-3)",
                  }}
                  transition={timelineSpring}
                  {...buttonMotionProps({ enabled: motionEnabled })}
                >
                  {item}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${selectedProjectId}-${view}`}
                initial={motionEnabled ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={motionEnabled ? { opacity: 0, y: -8 } : {}}
                transition={timelineSpring}
                className="h-full"
              >
                {loadingDetail ? <div className="skeleton h-[52vh] rounded-2xl" /> : null}

                {!loadingDetail && view === "milestones" ? (
                  <div className="flex h-full min-h-[52vh] flex-col">
                    <div className="hidden pb-2 md:block">
                      <div className="h-px w-full" style={{ background: "var(--border)" }} />
                    </div>
                    <div className="min-h-0 md:overflow-x-auto md:pb-3">
                      <div className="space-y-3 md:flex md:min-w-max md:snap-x md:gap-4 md:space-y-0">
                        {milestones.map((milestone) => {
                          const state = milestoneState(milestone.status);
                          return (
                            <motion.button
                              key={milestone.id}
                              layout
                              onClick={() => setSelectedMilestone(milestone)}
                              className="w-full snap-start rounded-2xl border p-4 text-left md:w-[280px]"
                              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                              transition={timelineSpring}
                              {...buttonMotionProps({ enabled: motionEnabled, hoverY: -2 })}
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="pill text-[10px]" style={{ background: state.tone, color: state.color }}>
                                  {state.label}
                                </span>
                                <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>
                                  {milestoneType(milestone)}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-sm font-semibold" style={{ color: "var(--text)" }}>{milestone.title}</p>
                              <p className="mt-2 text-xs" style={{ color: "var(--text-3)" }}>{formatDate(milestone.due_date)}</p>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {milestones.length === 0 ? (
                      <p className="mt-2 rounded-xl border border-dashed p-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                        Sem milestones para este projeto.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {!loadingDetail && view === "timeline" ? (
                  <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                    {milestones.map((milestone) => {
                      const state = milestoneState(milestone.status);
                      return (
                        <motion.button
                          key={milestone.id}
                          layout
                          onClick={() => setSelectedMilestone(milestone)}
                          className="w-full rounded-2xl border p-3 text-left"
                          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                          transition={timelineSpring}
                          {...buttonMotionProps({ enabled: motionEnabled, hoverY: -1.5 })}
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ background: state.color }} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{milestone.title}</p>
                              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                                {formatDate(milestone.due_date)} • {milestoneType(milestone)} • {state.label}
                              </p>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                ) : null}

                {!loadingDetail && view === "tasks" ? (
                  <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
                    {taskRows.map((task) => (
                      <motion.article
                        key={task.id}
                        layout
                        className="rounded-2xl border p-3"
                        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                        transition={timelineSpring}
                      >
                        <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{task.title}</p>
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>
                          {task.subtitle} {task.dueDate ? `• ${formatDate(task.dueDate)}` : ""}
                        </p>
                      </motion.article>
                    ))}
                    {taskRows.length === 0 ? (
                      <p className="rounded-xl border border-dashed p-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                        Sem tarefas pendentes.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.section>

        <motion.aside
          layout
          variants={variants.cardEnter}
          initial={motionEnabled ? "initial" : false}
          animate="animate"
          className="card min-h-[68vh] p-5 lg:h-[calc(100dvh-180px)] lg:overflow-y-auto"
        >
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Inbox / Updates</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
            Mensagens, comentários e entregas recentes do projeto.
          </p>

          <div className="mt-4 space-y-2">
            {updates.slice(0, 12).map((update) => (
              <motion.div
                key={update.id}
                layout
                transition={timelineSpring}
                className="rounded-2xl border p-3"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                <div className="mb-1 flex items-center gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
                  {update.kind === "message" ? <MessageSquare className="h-3.5 w-3.5" /> : null}
                  {update.kind === "review" ? <TriangleAlert className="h-3.5 w-3.5" /> : null}
                  {update.kind === "delivery" ? <Package className="h-3.5 w-3.5" /> : null}
                  <span>{update.subtitle}</span>
                </div>
                <p className="line-clamp-2 text-sm font-medium" style={{ color: "var(--text)" }}>{update.title}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
                    {new Date(update.createdAt).toLocaleString("pt-PT")}
                  </p>
                  <Link className="btn btn-ghost btn-sm" href={update.href}>
                    Abrir
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>

          {updates.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed p-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
              Sem updates recentes.
            </p>
          ) : null}
        </motion.aside>
      </div>

      <AnimatePresence>
        {selectedMilestone ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-end bg-black/25 p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedMilestone(null)}
          >
            <motion.div
              className="card w-full max-w-[420px] p-5"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 30, opacity: 0 }}
              transition={timelineSpring}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>
                    {milestoneType(selectedMilestone)}
                  </p>
                  <h4 className="line-clamp-2 text-lg font-semibold" style={{ color: "var(--text)" }}>{selectedMilestone.title}</h4>
                </div>
                <button className="icon-btn" onClick={() => setSelectedMilestone(null)} aria-label="Fechar detalhe">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs" style={{ color: "var(--text-2)" }}>
                <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(selectedMilestone.due_date)}</p>
                <p className="flex items-center gap-2"><Flag className="h-3.5 w-3.5" /> Estado: {milestoneState(selectedMilestone.status).label}</p>
                {selectedMilestone.description ? (
                  <p className="rounded-xl border p-2.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    {selectedMilestone.description}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  className="btn btn-secondary btn-sm"
                  href={buildGoogleLink(
                    selectedMilestone.title,
                    toIsoRange(selectedMilestone.due_date).start,
                    toIsoRange(selectedMilestone.due_date).end,
                    selectedMilestone.description ?? undefined,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <CalendarDays className="h-4 w-4" />
                  Add to Google
                </a>
                <a
                  className="btn btn-ghost btn-sm"
                  href={toIcsLink(
                    selectedMilestone.title,
                    toIsoRange(selectedMilestone.due_date).start,
                    toIsoRange(selectedMilestone.due_date).end,
                    selectedMilestone.description ?? undefined,
                  )}
                >
                  <Download className="h-4 w-4" />
                  Download ICS
                </a>
                {selectedProject ? (
                  <Link className="btn btn-ghost btn-sm" href={`/portal/projects/${selectedProject.id}?tab=inbox`}>
                    <MessageSquare className="h-4 w-4" />
                    Abrir projeto
                  </Link>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </LayoutGroup>
  );
}
