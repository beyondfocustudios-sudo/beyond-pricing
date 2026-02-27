"use client";

/**
 * Portal › Calendarização
 *
 * Two-state layout:
 *   • LIST  — animated grid of project cards
 *   • DETAIL — project selected: back button + horizontal milestone timeline
 *              + milestone list (left) + inbox panel (right on xl+, below on mobile)
 *
 * Animations: spring L→R timeline fill, staggered card entrance, layoutId morph.
 * Fully respects prefers-reduced-motion and dark / light CSS variables.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  MessageSquare,
  TriangleAlert,
} from "lucide-react";
import {
  computeProjectPhases,
  getClientProjects,
  getProjectMilestones,
  getProjectUpdates,
  type PortalMilestone,
  type PortalProject,
  type PortalUpdate,
  type ProjectPhase,
} from "@/lib/portal-data";
import {
  buttonMotionProps,
  spring,
  useMotionEnabled,
  variants,
} from "@/lib/motion";
import { MilestoneTimeline } from "./_components/MilestoneTimeline";
import { ProjectInboxPanel } from "./_components/ProjectInboxPanel";

// ─── Helpers ────────────────────────────────────────────────────────────────

type MilestoneStatus = "done" | "at-risk" | "in_progress" | "pending";

function normStatus(raw: string | null): MilestoneStatus {
  const s = (raw ?? "pending").toLowerCase();
  if (s === "done") return "done";
  if (s === "blocked" || s === "at-risk" || s === "delayed") return "at-risk";
  if (s === "in_progress" || s === "in progress") return "in_progress";
  return "pending";
}

const STATUS_META: Record<
  MilestoneStatus,
  { label: string; color: string; tone: string; Icon: React.ElementType }
> = {
  done: {
    label: "Concluído",
    color: "#15803d",
    tone: "rgba(22,163,74,0.12)",
    Icon: CheckCircle2,
  },
  "at-risk": {
    label: "Em risco",
    color: "#b91c1c",
    tone: "rgba(220,38,38,0.10)",
    Icon: TriangleAlert,
  },
  in_progress: {
    label: "Em curso",
    color: "var(--accent-blue)",
    tone: "rgba(26,143,163,0.12)",
    Icon: Clock,
  },
  pending: {
    label: "Pendente",
    color: "var(--text-3)",
    tone: "var(--surface-2)",
    Icon: CalendarDays,
  },
};

function formatDate(d: string | null): string {
  if (!d) return "Sem data";
  return new Date(d).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRelative(d: string): string {
  return new Date(d).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  });
}

function isDelivered(project: PortalProject, phases: ProjectPhase[]): boolean {
  const s = (project.status ?? "").toLowerCase();
  if (s === "entregue" || s === "delivered" || s === "completed") return true;
  return phases.length > 0 && phases.every((p) => p.status === "done");
}

/** Four grey placeholder dots for project cards (milestones are loaded lazily on click) */
function PlaceholderDots() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full"
          style={{ background: "var(--border)" }}
        />
      ))}
    </div>
  );
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function PortalCalendarPage() {
  const motionEnabled = useMotionEnabled();
  const reduced = useReducedMotion();

  // ── Data ─────────────────────────────────────────────────────────────────
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [milestones, setMilestones] = useState<PortalMilestone[]>([]);
  const [updates, setUpdates] = useState<PortalUpdate[]>([]);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(true);

  // ── Fetch projects ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingProjects(true);
      setError(null);
      try {
        const list = await getClientProjects();
        if (!cancelled) setProjects(list);
      } catch {
        if (!cancelled) setError("Falha ao carregar projetos.");
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch detail when project selected ────────────────────────────────────
  useEffect(() => {
    if (!selectedId) {
      setMilestones([]);
      setUpdates([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingDetail(true);
      try {
        const [ms, upd] = await Promise.all([
          getProjectMilestones(selectedId),
          getProjectUpdates(selectedId),
        ]);
        if (!cancelled) {
          setMilestones(
            ms.sort((a, b) => {
              const ta = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
              const tb = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
              return ta - tb;
            }),
          );
          setUpdates(upd);
        }
      } catch {
        // milestones stay empty — non-fatal
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedId]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const phases = useMemo<ProjectPhase[]>(
    () => computeProjectPhases(milestones),
    [milestones],
  );

  const handleSelectProject = useCallback((id: string) => {
    setSelectedId(id);
    setInboxOpen(true);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedId(null);
  }, []);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (loadingProjects) {
    return <div className="skeleton h-[74vh] rounded-3xl" />;
  }

  if (error) {
    return (
      <div className="card p-6">
        <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
        <button className="btn btn-secondary mt-3" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (selectedProject) {
    const delivered = isDelivered(selectedProject, phases);

    return (
      <LayoutGroup>
        <motion.div
          className="flex min-h-[74vh] flex-col gap-4"
          layoutId={`project-root-${selectedProject.id}`}
          layout
          transition={spring.soft}
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3">
            <motion.button
              className="icon-btn"
              onClick={handleBack}
              aria-label="Voltar"
              {...buttonMotionProps({ enabled: motionEnabled, tapScale: 0.92 })}
            >
              <ArrowLeft className="h-4 w-4" />
            </motion.button>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>
                Calendarização
              </p>
              <h1 className="truncate text-xl font-semibold" style={{ color: "var(--text)" }}>
                {selectedProject.name}
              </h1>
            </div>
            {delivered && (
              <span
                className="pill ml-auto shrink-0 text-[10px]"
                style={{ background: "rgba(22,163,74,0.14)", color: "#15803d" }}
              >
                Entregue ✓
              </span>
            )}
          </div>

          {/* ── Milestone Timeline ── */}
          <div
            className="card px-6 py-2"
            style={{
              background: delivered ? "rgba(22,163,74,0.04)" : "var(--surface)",
            }}
          >
            {loadingDetail ? (
              <div className="skeleton my-2 h-16 rounded-xl" />
            ) : (
              <MilestoneTimeline phases={phases} animateIn />
            )}
          </div>

          {/* ── Content grid: milestones (left) + inbox (right) ── */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_300px]">

            {/* Left column */}
            <motion.div
              className="flex flex-col gap-3"
              variants={variants.cardEnter}
              initial={motionEnabled ? "initial" : false}
              animate="animate"
            >
              {/* Milestones card */}
              <div className="card p-4">
                <h2
                  className="mb-3 text-xs font-semibold uppercase tracking-[0.11em]"
                  style={{ color: "var(--text-3)" }}
                >
                  Milestones
                </h2>

                {loadingDetail ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
                  </div>
                ) : milestones.length === 0 ? (
                  <p
                    className="rounded-xl border border-dashed p-4 text-xs"
                    style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
                  >
                    Sem milestones definidos para este projeto.
                  </p>
                ) : (
                  <motion.div
                    className="space-y-2"
                    variants={variants.containerStagger}
                    initial={motionEnabled ? "initial" : false}
                    animate="animate"
                  >
                    {milestones.map((ms) => {
                      const st = normStatus(ms.status);
                      const meta = STATUS_META[st];
                      const { Icon } = meta;
                      return (
                        <motion.div
                          key={ms.id}
                          className="flex items-start gap-3 rounded-2xl border p-3"
                          style={{ borderColor: "var(--border)", background: meta.tone }}
                          variants={variants.itemEnter}
                        >
                          <Icon
                            className="mt-0.5 h-4 w-4 shrink-0"
                            style={{ color: meta.color }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
                              {ms.title}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-xs" style={{ color: "var(--text-3)" }}>
                                {formatDate(ms.due_date)}
                              </span>
                              <span
                                className="pill text-[10px]"
                                style={{ background: meta.tone, color: meta.color }}
                              >
                                {meta.label}
                              </span>
                            </div>
                            {ms.description && (
                              <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-2)" }}>
                                {ms.description}
                              </p>
                            )}
                          </div>
                          {ms.progress_percent !== null && ms.progress_percent > 0 && (
                            <span className="shrink-0 text-xs font-semibold" style={{ color: meta.color }}>
                              {ms.progress_percent}%
                            </span>
                          )}
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </div>

              {/* Updates card */}
              {updates.length > 0 && (
                <div className="card p-4">
                  <h2
                    className="mb-3 text-xs font-semibold uppercase tracking-[0.11em]"
                    style={{ color: "var(--text-3)" }}
                  >
                    Últimas atualizações
                  </h2>
                  <div className="space-y-2">
                    {updates.slice(0, 8).map((upd) => (
                      <a
                        key={upd.id}
                        href={upd.href}
                        className="flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors hover:bg-[var(--surface-2)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <span
                          className="shrink-0 text-[10px] uppercase tracking-[0.1em]"
                          style={{ color: "var(--text-3)" }}
                        >
                          {upd.type}
                        </span>
                        <p className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text)" }}>
                          {upd.title}
                        </p>
                        <span className="shrink-0 text-[10px]" style={{ color: "var(--text-3)" }}>
                          {formatRelative(upd.created_at)}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Mobile inbox toggle */}
              <button
                className="btn btn-secondary btn-sm w-full gap-2 xl:hidden"
                onClick={() => setInboxOpen((v) => !v)}
              >
                <MessageSquare className="h-4 w-4" />
                {inboxOpen ? "Fechar Inbox" : "Abrir Inbox"}
              </button>

              {/* Mobile inbox (inline, below milestones) */}
              <AnimatePresence>
                {inboxOpen && (
                  <motion.div
                    className="xl:hidden"
                    style={{ minHeight: 360 }}
                    initial={reduced ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, y: 12 }}
                    transition={spring.ui}
                  >
                    <ProjectInboxPanel
                      projectId={selectedProject.id}
                      projectName={selectedProject.name}
                      onClose={() => setInboxOpen(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Right column: inbox panel (desktop) */}
            <AnimatePresence>
              {inboxOpen && (
                <div className="hidden xl:flex xl:flex-col" style={{ minHeight: 400 }}>
                  <ProjectInboxPanel
                    projectId={selectedProject.id}
                    projectName={selectedProject.name}
                    onClose={() => setInboxOpen(false)}
                  />
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Floating "open inbox" when closed on desktop */}
          <AnimatePresence>
            {!inboxOpen && (
              <motion.button
                className="fixed bottom-6 right-6 z-30 btn btn-secondary btn-sm gap-2 shadow-lg"
                onClick={() => setInboxOpen(true)}
                initial={reduced ? false : { opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0, scale: 0.88 }}
                transition={spring.fast}
              >
                <MessageSquare className="h-4 w-4" />
                Inbox
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LIST VIEW — project cards grid
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <LayoutGroup>
      <motion.div
        className="flex flex-col gap-5"
        variants={variants.page}
        initial={motionEnabled ? "initial" : false}
        animate="animate"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>
              Calendarização
            </p>
            <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
              Os teus projetos
            </h1>
          </div>
          <span className="pill ml-auto text-[11px]">{projects.length}</span>
        </div>

        {/* Empty state */}
        {projects.length === 0 ? (
          <p
            className="rounded-2xl border border-dashed p-8 text-center text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
          >
            Nenhum projeto associado à tua conta.
          </p>
        ) : (
          /* Cards grid */
          <motion.div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            variants={variants.containerStagger}
            initial={motionEnabled ? "initial" : false}
            animate="animate"
          >
            {projects.map((project) => {
              const delivered =
                (project.status ?? "").toLowerCase() === "entregue" ||
                (project.status ?? "").toLowerCase() === "delivered";

              return (
                <motion.button
                  key={project.id}
                  layoutId={`project-root-${project.id}`}
                  layout
                  className="group rounded-2xl border p-4 text-left"
                  style={{
                    borderColor: delivered ? "rgba(22,163,74,0.30)" : "var(--border)",
                    background: delivered ? "rgba(22,163,74,0.06)" : "var(--surface)",
                  }}
                  onClick={() => handleSelectProject(project.id)}
                  variants={variants.itemEnter}
                  transition={spring.soft}
                  {...buttonMotionProps({ enabled: motionEnabled, hoverY: -3 })}
                >
                  {/* Name row */}
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {project.name}
                    </p>
                    {delivered && (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0"
                        style={{ color: "#15803d" }}
                      />
                    )}
                  </div>

                  {/* Phase dots — placeholder (we don't pre-load all projects' milestones) */}
                  <PlaceholderDots />

                  {/* Footer */}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>
                      {formatRelative(project.updated_at)}
                    </span>
                    <span className="pill text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                      Ver →
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </motion.div>
    </LayoutGroup>
  );
}
