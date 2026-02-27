"use client";

/**
 * Portal › Calendarização
 *
 * Single-screen detail view:
 * - Auto-loads latest project on mount
 * - Timeline horizontal at top (animates to project progress point)
 * - Left: vertical milestones with icons
 * - Right: scrollable inbox panel (project-specific conversation)
 * - Bottom: grid of other client projects to switch
 * - Click other project → internal state change (no reload)
 *
 * Pixel-perfect to reference image.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
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

// ─── Types ──────────────────────────────────────────────────────────────────

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
  {
    label: string;
    color: string;
    bgColor: string;
    Icon: React.ElementType;
  }
> = {
  done: {
    label: "Concluído",
    color: "#15803d",
    bgColor: "rgba(22,163,74,0.1)",
    Icon: CheckCircle2,
  },
  "at-risk": {
    label: "Em risco",
    color: "#b91c1c",
    bgColor: "rgba(220,38,38,0.08)",
    Icon: TriangleAlert,
  },
  in_progress: {
    label: "Em curso",
    color: "var(--accent-blue)",
    bgColor: "rgba(26,143,163,0.08)",
    Icon: Clock,
  },
  pending: {
    label: "Pendente",
    color: "var(--text-3)",
    bgColor: "var(--surface-2)",
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

function isDelivered(project: PortalProject): boolean {
  const s = (project.status ?? "").toLowerCase();
  return (
    s === "entregue" || s === "delivered" || s === "completed"
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PortalCalendarPage() {
  const motionEnabled = useMotionEnabled();

  // ── Data ─────────────────────────────────────────────────────────────────
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [allProjects, setAllProjects] = useState<PortalProject[]>([]);
  const [milestones, setMilestones] = useState<PortalMilestone[]>([]);
  const [updates, setUpdates] = useState<PortalUpdate[]>([]);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // ── Fetch all projects ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingProjects(true);
      setError(null);
      try {
        const list = await getClientProjects();
        if (!cancelled) {
          setAllProjects(list);
          // Auto-select the most recent project
          if (list.length > 0) {
            setSelectedProjectId(list[0].id);
          }
        }
      } catch {
        if (!cancelled) setError("Falha ao carregar projetos.");
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch project milestones when selected project changes ────────────────
  useEffect(() => {
    if (!selectedProjectId) {
      setMilestones([]);
      setUpdates([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingDetail(true);
      try {
        const [ms, upd] = await Promise.all([
          getProjectMilestones(selectedProjectId),
          getProjectUpdates(selectedProjectId),
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
        // milestones stay empty
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedProjectId]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedProject = useMemo(
    () => allProjects.find((p) => p.id === selectedProjectId) ?? null,
    [allProjects, selectedProjectId],
  );

  const phases = useMemo<ProjectPhase[]>(
    () => computeProjectPhases(milestones),
    [milestones],
  );

  const otherProjects = useMemo(
    () => allProjects.filter((p) => p.id !== selectedProjectId),
    [allProjects, selectedProjectId],
  );

  const handleSelectProject = useCallback((id: string) => {
    setSelectedProjectId(id);
  }, []);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (loadingProjects) {
    return <div className="skeleton h-[80vh] rounded-3xl" />;
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

  if (!selectedProject) {
    return (
      <div className="card p-6">
        <p className="text-sm" style={{ color: "var(--text-3)" }}>
          Nenhum projeto disponível.
        </p>
      </div>
    );
  }

  const delivered = isDelivered(selectedProject);

  // ═══════════════════════════════════════════════════════════════════════════
  //  SINGLE DETAIL VIEW (always shown)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <LayoutGroup>
      <motion.div
        className="flex min-h-[88vh] flex-col gap-4"
        layoutId={`calendar-detail-${selectedProject.id}`}
        layout
        transition={spring.soft}
      >
        {/* ── Header: back + project name ── */}
        <div className="flex items-center gap-3">
          <motion.button
            className="icon-btn"
            onClick={() => window.history.back()}
            aria-label="Voltar"
            {...buttonMotionProps({ enabled: motionEnabled, tapScale: 0.92 })}
          >
            <ArrowLeft className="h-4 w-4" />
          </motion.button>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>
              Calendarização
            </p>
            <h1 className="truncate text-2xl font-semibold" style={{ color: "var(--text)" }}>
              {selectedProject.name}
            </h1>
          </div>
          {delivered && (
            <span
              className="pill shrink-0 text-[10px]"
              style={{ background: "rgba(22,163,74,0.14)", color: "#15803d" }}
            >
              Entregue ✓
            </span>
          )}
        </div>

        {/* ── Timeline: horizontal with animation to progress point ── */}
        <div
          className="card px-6 py-3"
          style={{
            background: delivered ? "rgba(22,163,74,0.04)" : "var(--surface)",
          }}
        >
          {loadingDetail ? (
            <div className="skeleton my-3 h-20 rounded-xl" />
          ) : (
            <MilestoneTimeline phases={phases} animateIn={true} />
          )}
        </div>

        {/* ── Main content: milestones (left) + inbox (right) ── */}
        <div className="flex min-h-0 flex-1 gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_300px]">

          {/* Left: milestones vertical with icons */}
          <motion.div
            className="flex flex-col gap-0 min-w-0 border-l-4 pl-6"
            style={{ borderColor: "var(--border)" }}
            variants={variants.cardEnter}
            initial={motionEnabled ? "initial" : false}
            animate="animate"
          >
            <h2
              className="mb-4 text-xs font-semibold uppercase tracking-[0.11em]"
              style={{ color: "var(--text-3)" }}
            >
              Milestones
            </h2>

            {loadingDetail ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton h-12 rounded-lg" />
                ))}
              </div>
            ) : milestones.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                Sem milestones definidos.
              </p>
            ) : (
              <motion.div
                className="space-y-4"
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
                      className="flex items-start gap-3"
                      variants={variants.itemEnter}
                    >
                      <Icon
                        className="mt-1 h-5 w-5 shrink-0"
                        style={{ color: meta.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-semibold"
                          style={{ color: "var(--text)" }}
                        >
                          {ms.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-xs" style={{ color: "var(--text-3)" }}>
                            {formatDate(ms.due_date)}
                          </span>
                          <span
                            className="text-[11px] font-medium px-2 py-1 rounded"
                            style={{
                              background: meta.bgColor,
                              color: meta.color,
                            }}
                          >
                            {meta.label}
                          </span>
                        </div>
                        {ms.description && (
                          <p className="mt-1 text-xs line-clamp-2" style={{ color: "var(--text-2)" }}>
                            {ms.description}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </motion.div>

          {/* Right: inbox panel (scrollable) */}
          <AnimatePresence>
            <div className="hidden xl:flex xl:flex-col" style={{ minHeight: 400 }}>
              <ProjectInboxPanel
                projectId={selectedProject.id}
                projectName={selectedProject.name}
                onClose={() => {}}
              />
            </div>
          </AnimatePresence>
        </div>

        {/* ── Bottom: grid of other client projects to switch ── */}
        {otherProjects.length > 0 && (
          <motion.div
            className="border-t pt-6"
            style={{ borderColor: "var(--border)" }}
            variants={variants.cardEnter}
            initial={motionEnabled ? "initial" : false}
            animate="animate"
          >
            <h2
              className="mb-3 text-xs font-semibold uppercase tracking-[0.11em]"
              style={{ color: "var(--text-3)" }}
            >
              Outros projetos
            </h2>
            <motion.div
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              variants={variants.containerStagger}
              initial={motionEnabled ? "initial" : false}
              animate="animate"
            >
              {otherProjects.map((proj) => {
                const projDelivered = isDelivered(proj);
                return (
                  <motion.button
                    key={proj.id}
                    className="group rounded-2xl border p-4 text-left transition-all"
                    style={{
                      borderColor: projDelivered
                        ? "rgba(22,163,74,0.30)"
                        : "var(--border)",
                      background: projDelivered
                        ? "rgba(22,163,74,0.06)"
                        : "var(--surface)",
                    }}
                    onClick={() => handleSelectProject(proj.id)}
                    variants={variants.itemEnter}
                    transition={spring.soft}
                    {...buttonMotionProps({ enabled: motionEnabled, hoverY: -2 })}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className="truncate text-sm font-semibold"
                        style={{ color: "var(--text)" }}
                      >
                        {proj.name}
                      </p>
                      {projDelivered && (
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0"
                          style={{ color: "#15803d" }}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                      {formatRelative(proj.updated_at)}
                    </p>
                  </motion.button>
                );
              })}
            </motion.div>
          </motion.div>
        )}

        {/* Mobile inbox (below on small screens) */}
        <div className="xl:hidden">
          <ProjectInboxPanel
            projectId={selectedProject.id}
            projectName={selectedProject.name}
            onClose={() => {}}
          />
        </div>
      </motion.div>
    </LayoutGroup>
  );
}
