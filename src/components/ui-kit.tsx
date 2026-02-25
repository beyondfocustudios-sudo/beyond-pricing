"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { CalendarDays, Clock3, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import {
  buttonMotionProps,
  cardHoverProps,
  transitions,
  useDesktopHoverMotion,
  useMotionEnabled,
} from "@/lib/motion";

export function Surface({
  className,
  children,
  ...props
}: {
  className?: string;
  children: ReactNode;
} & HTMLMotionProps<"section">) {
  const desktopHover = useDesktopHoverMotion();

  return (
    <motion.section className={cn("surface card-hover", className)} {...cardHoverProps(desktopHover)} {...props}>
      {children}
    </motion.section>
  );
}

export function Card({
  className,
  children,
  ...props
}: {
  className?: string;
  children: ReactNode;
} & HTMLMotionProps<"div">) {
  const desktopHover = useDesktopHoverMotion();

  return (
    <motion.div className={cn("card card-hover", className)} {...cardHoverProps(desktopHover)} {...props}>
      {children}
    </motion.div>
  );
}

export function Pill({
  className,
  children,
  active = false,
}: {
  className?: string;
  children: ReactNode;
  active?: boolean;
}) {
  const desktopHover = useDesktopHoverMotion();

  return (
    <motion.span
      className={cn("pill", active && "pill-active", className)}
      {...(desktopHover ? { whileHover: { y: -1 }, transition: transitions.smooth } : {})}
    >
      {children}
    </motion.span>
  );
}

export function PillButton({
  className,
  children,
  variant = "secondary",
  ...props
}: HTMLMotionProps<"button"> & {
  variant?: "secondary" | "primary";
}) {
  const motionEnabled = useMotionEnabled();

  return (
    <motion.button
      className={cn(
        "pill-btn",
        variant === "primary" ? "pill-btn-primary" : "pill-btn-secondary",
        className,
      )}
      {...buttonMotionProps({ enabled: motionEnabled })}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function PillInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("pill-input", className)} {...props} />;
}

export function IconButton({
  className,
  children,
  ...props
}: HTMLMotionProps<"button">) {
  const motionEnabled = useMotionEnabled();

  return (
    <motion.button className={cn("icon-btn", className)} {...buttonMotionProps({ enabled: motionEnabled })} {...props}>
      {children}
    </motion.button>
  );
}

export function TopScheduleBar({
  className,
  avatars = [],
}: {
  className?: string;
  avatars?: string[];
}) {
  const reducedMotion = useReducedMotion();
  const dateLabel = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const slots = ["09:00", "11:30", "14:00", "16:30"];

  return (
    <motion.div
      initial={reducedMotion ? false : "initial"}
      animate={reducedMotion ? undefined : "animate"}
      variants={{ initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 } }}
      transition={transitions.page}
      className={cn("top-schedule-bar p-4 md:p-5", className)}
    >
      <div className="flex flex-wrap items-center gap-3 md:gap-5">
        <div className="flex items-center gap-2.5">
          <span className="icon-btn" aria-hidden>
            <CalendarDays className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--muted)" }}>
              Schedule
            </p>
            <p className="text-sm font-semibold capitalize" style={{ color: "var(--text)" }}>
              {dateLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2">
          {slots.map((slot) => (
            <span key={slot} className="pill inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {slot}
            </span>
          ))}
        </div>

        <div className="flex items-center">
          {avatars.length > 0 ? (
            <div className="-space-x-2">
              {avatars.slice(0, 4).map((name) => (
                <span
                  key={name}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold"
                  style={{
                    background: "var(--surface-2)",
                    borderColor: "var(--border-soft)",
                    color: "var(--text)",
                  }}
                >
                  {name.trim().slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
          ) : (
            <span className="pill">Sem equipa atribuida</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function SidebarRail({
  className,
  children,
  ...props
}: {
  className?: string;
  children: ReactNode;
} & HTMLMotionProps<"aside">) {
  return (
    <motion.aside className={cn("sidebar-rail", className)} {...props}>
      {children}
    </motion.aside>
  );
}

export function KpiCard({
  className,
  label,
  value,
  hint,
  icon: Icon,
}: {
  className?: string;
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
}) {
  const reducedMotion = useReducedMotion();
  const desktopHover = useDesktopHoverMotion();

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      {...cardHoverProps(!reducedMotion && desktopHover)}
      transition={transitions.smooth}
      className={cn("kpi-card", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--muted)" }}>
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color: "var(--text)", letterSpacing: "-0.03em" }}>
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
              {hint}
            </p>
          ) : null}
        </div>
        <span className="icon-btn" aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </motion.div>
  );
}

export function ChartCard({
  className,
  title,
  action,
  children,
}: {
  className?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const desktopHover = useDesktopHoverMotion();

  return (
    <motion.section className={cn("chart-card card-hover", className)} {...cardHoverProps(desktopHover)}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          {title}
        </h3>
        {action}
      </header>
      {children}
    </motion.section>
  );
}

export function EmptyState({
  className,
  title,
  description,
  action,
}: {
  className?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("empty-state empty-state-premium", className)}>
      <Search className="empty-icon" />
      <p className="empty-title">{title}</p>
      {description ? <p className="empty-desc">{description}</p> : null}
      {action}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0.65 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={cn("skeleton-card h-28", className)}
    />
  );
}
