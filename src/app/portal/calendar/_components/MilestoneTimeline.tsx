"use client";

/**
 * MilestoneTimeline
 * Horizontal 4-phase progress bar for a project.
 * Animates L→R on mount (spring, stagger per node).
 */

import { motion, useReducedMotion } from "framer-motion";
import { spring } from "@/lib/motion";
import type { ProjectPhase, PhaseStatus } from "@/lib/portal-data";

interface Props {
  phases: ProjectPhase[];
  /** When true the timeline fills in with spring animation */
  animateIn?: boolean;
}

// Diameter of each phase node circle (px)
const NODE = 20;

/**
 * Returns a 0-1 fill ratio for the connecting line.
 * Counts completed phases + partial credit for in_progress.
 */
function computeFill(phases: ProjectPhase[]): number {
  const segments = phases.length - 1;
  if (segments <= 0) return 0;
  let filled = 0;
  for (const phase of phases) {
    if (phase.status === "done") {
      filled += 1;
    } else if (phase.status === "in_progress") {
      filled += (phase.progress_percent || 0) / 100;
      break; // stop accumulating after active phase
    } else {
      break;
    }
  }
  return Math.min(filled / segments, 1);
}

function nodeRingColor(status: PhaseStatus): string {
  switch (status) {
    case "done":        return "#15803d";
    case "in_progress": return "var(--accent-blue)";
    case "delayed":     return "#b91c1c";
    default:            return "var(--border)";
  }
}

function nodeDotColor(status: PhaseStatus): string {
  switch (status) {
    case "done":        return "#15803d";
    case "in_progress": return "var(--accent-blue)";
    case "delayed":     return "#b91c1c";
    default:            return "transparent";
  }
}

function formatDue(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  });
}

export function MilestoneTimeline({ phases, animateIn = true }: Props) {
  const reduced = useReducedMotion();
  const fill = computeFill(phases);

  return (
    <div className="relative w-full select-none py-4 px-1">
      {/* Outer container — nodes with justify-between */}
      <div className="relative flex w-full items-start justify-between">

        {/* ── Background track ── */}
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            top: NODE / 2 - 1,          // centre on node
            left: NODE / 2,
            right: NODE / 2,
            height: 2,
            background: "var(--border)",
          }}
        />

        {/* ── Animated fill track ── */}
        <motion.div
          className="pointer-events-none absolute rounded-full origin-left"
          style={{
            top: NODE / 2 - 1,
            left: NODE / 2,
            right: NODE / 2,
            height: 2,
            background: "var(--accent-blue)",
            scaleX: fill,
          }}
          initial={reduced || !animateIn ? false : { scaleX: 0 }}
          animate={{ scaleX: fill }}
          transition={
            reduced
              ? undefined
              : { ...spring.soft, delay: animateIn ? 0.12 : 0 }
          }
        />

        {/* ── Phase nodes ── */}
        {phases.map((phase, idx) => (
          <div
            key={phase.key}
            className="relative z-10 flex flex-col items-center"
            style={{ width: NODE }}
          >
            {/* Circle */}
            <motion.div
              className="relative flex items-center justify-center rounded-full border-2"
              style={{
                width: NODE,
                height: NODE,
                borderColor: nodeRingColor(phase.status),
                background: "var(--surface)",
              }}
              initial={reduced || !animateIn ? false : { scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                reduced
                  ? undefined
                  : { ...spring.fast, delay: animateIn ? idx * 0.08 + 0.04 : 0 }
              }
            >
              {/* Inner dot */}
              <motion.div
                className="rounded-full"
                style={{
                  width: 10,
                  height: 10,
                  background: nodeDotColor(phase.status),
                }}
                initial={reduced || !animateIn ? false : { scale: 0 }}
                animate={{ scale: phase.status === "pending" ? 0 : 1 }}
                transition={
                  reduced
                    ? undefined
                    : { ...spring.fast, delay: animateIn ? idx * 0.1 + 0.18 : 0 }
                }
              />

              {/* In-progress pulse ring */}
              {phase.status === "in_progress" && !reduced && (
                <motion.div
                  className="pointer-events-none absolute inset-[-4px] rounded-full"
                  style={{
                    border: "2px solid var(--accent-blue)",
                    opacity: 0.5,
                  }}
                  animate={{ scale: [1, 1.55], opacity: [0.5, 0] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: "easeOut",
                  }}
                />
              )}
            </motion.div>

            {/* Label + date
                On mobile: only show first, last, and the active (in_progress) node label */}
            <motion.div
              className={[
                "mt-2 flex flex-col items-center gap-0.5",
                idx === 0 || idx === phases.length - 1
                  ? ""
                  : "hidden sm:flex",
                phase.status === "in_progress" ? "!flex" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              initial={reduced || !animateIn ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduced
                  ? undefined
                  : { ...spring.soft, delay: animateIn ? idx * 0.1 + 0.28 : 0 }
              }
            >
              <span
                className="max-w-[72px] text-center text-[10px] font-medium leading-tight"
                style={{
                  color:
                    phase.status === "pending"
                      ? "var(--text-3)"
                      : "var(--text-2)",
                }}
              >
                {phase.label}
              </span>
              {phase.due_date && (
                <span
                  className="text-[9px]"
                  style={{ color: "var(--text-3)" }}
                >
                  {formatDue(phase.due_date)}
                </span>
              )}
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  );
}
