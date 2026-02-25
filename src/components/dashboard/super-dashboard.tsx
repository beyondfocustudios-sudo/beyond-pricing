"use client";

import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Plus,
  Search,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useState, type ReactNode } from "react";
import { cn, fmtEur } from "@/lib/utils";
import { cardHoverProps, transitions, useDesktopHoverMotion, useMotionEnabled, variants } from "@/lib/motion";

export type DashboardMode = "ceo" | "company";

type Tone = "mint" | "yellow" | "lilac" | "blue";

const toneClasses: Record<Tone, string> = {
  mint: "stat-chip--mint",
  yellow: "stat-chip--yellow",
  lilac: "stat-chip--lilac",
  blue: "stat-chip--blue",
};

const DONUT_COLORS = ["var(--accent-blue)", "var(--accent-yellow)", "var(--accent-mint)", "var(--accent-lilac)"];

export type ScheduleItem = {
  id: string;
  time: string;
  title: string;
  subtitle: string;
  startsAt?: string;
  endsAt?: string;
  calendarHref?: string;
  active?: boolean;
};

export type CompactProjectRow = {
  id: string;
  name: string;
  owner: string;
  status: string;
  value: number;
};

export type ListRow = {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  ctaHref?: string;
  ctaLabel?: string;
};

export function SuperShell({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("super-shell-card", className)}>{children}</div>;
}

export function PillTabs({
  tabs,
  active,
}: {
  tabs: Array<{ href: string; label: string }>;
  active: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <nav className="top-pill-tabs" aria-label="Main">
      {tabs.map((tab) => {
        const selected = active === tab.href;
        return (
          <Link key={tab.href} href={tab.href} className={cn("pill-tab", selected && "pill-tab--active")}>
            {tab.label}
            {selected && !reduceMotion ? (
              <motion.span
                layoutId="top-pill-active"
                className="pill-tab-indicator"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function SegmentedModeToggle({
  mode,
  onChange,
}: {
  mode: DashboardMode;
  onChange: (mode: DashboardMode) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="inline-flex rounded-full border p-1" style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)" }}>
      {(["ceo", "company"] as DashboardMode[]).map((item) => {
        const active = mode === item;
        return (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={cn("pill-tab", "px-3 py-1.5 text-[0.72rem]", active && "pill-tab--active")}
          >
            {item === "ceo" ? "CEO" : "Empresa"}
            {active && !reduceMotion ? (
              <motion.span
                layoutId="dashboard-mode-pill"
                className="pill-tab-indicator"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export const ModeToggle = SegmentedModeToggle;

export function SearchPill({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="table-search-pill min-w-[10.5rem]">
      <Search className="h-3.5 w-3.5" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  );
}

export function DashboardShell({
  sidebar,
  header,
  children,
}: {
  sidebar?: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="dashboard-shell">
      {sidebar ? <aside className="dashboard-shell__sidebar">{sidebar}</aside> : null}
      <section className="dashboard-shell__content">
        <div className="dashboard-head">{header}</div>
        {children}
      </section>
    </div>
  );
}

export function IconSidebar({
  items,
  activePath,
}: {
  items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
  activePath: string;
}) {
  return (
    <div className="icon-sidebar">
      {items.map((item) => {
        const active = activePath === item.href;
        return (
          <Link key={item.href} href={item.href} className={cn("icon-sidebar__item", active && "icon-sidebar__item--active")} title={item.label}>
            <item.icon className="h-4 w-4" />
          </Link>
        );
      })}
    </div>
  );
}

export function HeroSummaryCard({
  greeting,
  subtitle,
  metrics,
  primaryCta,
  secondaryCta,
}: {
  greeting: string;
  subtitle: string;
  metrics: Array<{ id: string; label: string; value: string; hint: string; tone: Tone }>;
  primaryCta: { href: string; label: string };
  secondaryCta: { href: string; label: string };
}) {
  const desktopHover = useDesktopHoverMotion();

  return (
    <motion.section className="super-card hero-summary-card card-hover" {...cardHoverProps(desktopHover)}>
      <div className="hero-summary-card__blob" />
      <div className="hero-summary-card__blob hero-summary-card__blob--2" />

      <div className="relative z-[2]">
        <p className="text-[0.72rem] uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>
          CEO View
        </p>
        <h1 className="mt-2 text-[2.2rem] font-[540] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
          {greeting}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
          {subtitle}
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <article key={metric.id} className={cn("hero-metric", toneClasses[metric.tone])}>
              <p className="hero-metric__label">{metric.label}</p>
              <p className="hero-metric__value">{metric.value}</p>
              <p className="hero-metric__hint">{metric.hint}</p>
            </article>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Link href={primaryCta.href} className="btn btn-primary btn-sm">
            <Plus className="h-3.5 w-3.5" />
            {primaryCta.label}
          </Link>
          <Link href={secondaryCta.href} className="btn btn-secondary btn-sm">
            {secondaryCta.label}
          </Link>
        </div>
      </div>
    </motion.section>
  );
}

export function DarkCalendarCard({
  events,
  feedHref,
}: {
  events: ScheduleItem[];
  feedHref?: string;
}) {
  const desktopHover = useDesktopHoverMotion();
  const day = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "short" });
  return (
    <motion.section className="super-card dark-insight-card dark-calendar-card card-hover" {...cardHoverProps(desktopHover)}>
      <header className="super-card__header">
        <div>
          <h3>Calendário</h3>
          <p className="super-card__subtitle" style={{ color: "rgba(233, 240, 255, 0.68)" }}>{day}</p>
        </div>
        <CalendarClock className="h-4 w-4" />
      </header>
      <ol className="dark-calendar-list">
        {events.slice(0, 4).map((event) => (
          <li key={event.id} className={cn("dark-calendar-row", event.active && "dark-calendar-row--active")}>
            <span className="dark-calendar-time">{event.time}</span>
            <div className="min-w-0">
              <p className="dark-calendar-title">{event.title}</p>
              <p className="dark-calendar-subtitle">{event.subtitle}</p>
              {event.calendarHref ? (
                <a href={event.calendarHref} className="dark-calendar-add" download>
                  Add to calendar
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {feedHref ? (
        <div className="dark-calendar-feed">
          <p>Feed ICS para Apple/Outlook/Google:</p>
          <a href={feedHref} className="dark-calendar-feed-link">
            {feedHref}
          </a>
        </div>
      ) : null}
    </motion.section>
  );
}

export function CompactKpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.article
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="super-card compact-kpi-card"
    >
      <p className="compact-kpi-card__label">{label}</p>
      <p className="compact-kpi-card__value">{value}</p>
      <p className="compact-kpi-card__hint">{hint}</p>
    </motion.article>
  );
}

export function ListCard({
  title,
  subtitle,
  rows,
  className,
}: {
  title: string;
  subtitle?: string;
  rows: ListRow[];
  className?: string;
}) {
  const desktopHover = useDesktopHoverMotion();
  const motionEnabled = useMotionEnabled();

  return (
    <motion.section className={cn("super-card list-card card-hover", className)} {...cardHoverProps(desktopHover)}>
      <header className="super-card__header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="super-card__subtitle">{subtitle}</p> : null}
        </div>
      </header>

      <div className="list-card-rows">
        {rows.length === 0 ? (
          <p className="compact-table-empty">Sem dados para mostrar.</p>
        ) : (
          <AnimatePresence initial={false}>
            {rows.slice(0, 5).map((row) => (
              <motion.article
                key={row.id}
                className="list-card-row"
                initial={motionEnabled ? "initial" : false}
                animate={motionEnabled ? "animate" : undefined}
                exit={motionEnabled ? "exit" : undefined}
                variants={variants.listItem}
                transition={transitions.smooth}
              >
                <div className="min-w-0 flex-1">
                  <p className="list-card-row__title">{row.title}</p>
                  {row.subtitle ? <p className="list-card-row__subtitle">{row.subtitle}</p> : null}
                </div>
                {row.status ? <span className="status-pill">{row.status}</span> : null}
                {row.ctaHref && row.ctaLabel ? (
                  <Link href={row.ctaHref} className="pill-tab">
                    {row.ctaLabel}
                  </Link>
                ) : null}
              </motion.article>
            ))}
          </AnimatePresence>
        )}
      </div>
    </motion.section>
  );
}

export function StatChip({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  tone: Tone;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("stat-chip", toneClasses[tone])}
    >
      <p className="stat-chip__label">{label}</p>
      <p className="stat-chip__value">{value}</p>
      <p className="stat-chip__delta">{delta}</p>
    </motion.article>
  );
}

export function ScheduleCard({ items }: { items: ScheduleItem[] }) {
  const desktopHover = useDesktopHoverMotion();
  return (
    <motion.section className="super-card schedule-card card-hover" {...cardHoverProps(desktopHover)}>
      <header className="super-card__header">
        <h3>Schedule</h3>
        <CalendarClock className="h-4 w-4" />
      </header>

      <ol className="schedule-list">
        {items.map((item) => (
          <li key={item.id} className={cn("schedule-item", item.active && "schedule-item--active")}>
            <div className="schedule-time">{item.time}</div>
            <div className="schedule-dot" />
            <div className="schedule-content">
              <p className="schedule-title">{item.title}</p>
              <p className="schedule-subtitle">{item.subtitle}</p>
            </div>
          </li>
        ))}
      </ol>
    </motion.section>
  );
}

export function DarkInsightCard({ alerts }: { alerts: Array<{ level: "ok" | "warn"; text: string }> }) {
  const desktopHover = useDesktopHoverMotion();
  return (
    <motion.section className="super-card dark-insight-card card-hover" {...cardHoverProps(desktopHover)}>
      <header className="super-card__header">
        <h3>Guardrails</h3>
        <TrendingUp className="h-4 w-4" />
      </header>

      <div className="dark-insight-body">
        {alerts.length === 0 ? (
          <div className="dark-alert-row">
            <CheckCircle2 className="h-4 w-4" />
            <p>Sem alertas críticos hoje.</p>
          </div>
        ) : (
          alerts.slice(0, 4).map((alert, idx) => (
            <div key={`${alert.text}-${idx}`} className="dark-alert-row">
              {alert.level === "warn" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              <p>{alert.text}</p>
            </div>
          ))
        )}
      </div>
    </motion.section>
  );
}

export function CompactTableCard({ rows }: { rows: CompactProjectRow[] }) {
  const [query, setQuery] = useState("");
  const desktopHover = useDesktopHoverMotion();
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(q) || row.owner.toLowerCase().includes(q));
  }, [query, rows]);

  return (
    <motion.section className="super-card table-card card-hover" {...cardHoverProps(desktopHover)}>
      <header className="super-card__header">
        <h3>Projects</h3>
        <SearchPill value={query} onChange={setQuery} placeholder="Search" />
      </header>

      <div className="compact-table-wrap">
        <table className="compact-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Owner</th>
              <th>Status</th>
              <th className="text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.slice(0, 5).map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.owner}</td>
                <td>
                  <span className="status-pill">{row.status}</span>
                </td>
                <td className="text-right">{fmtEur(row.value)}</td>
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="compact-table-empty">
                  No projects found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

export function ChartCard({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  const desktopHover = useDesktopHoverMotion();
  return (
    <motion.section className={cn("super-card chart-card card-hover", className)} {...cardHoverProps(desktopHover)}>
      <header className="super-card__header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="super-card__subtitle">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </motion.section>
  );
}

export function ForecastLine({ data }: { data: Array<{ month: string; value: number }> }) {
  return (
    <div className="chart-box h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="rgba(22, 35, 55, 0.08)" strokeDasharray="3 7" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8f98a8" }} />
          <YAxis hide />
          <Tooltip
            formatter={(value: unknown) => [fmtEur(Number(value ?? 0)), "Forecast"]}
            contentStyle={{
              borderRadius: 14,
              border: "1px solid rgba(22, 35, 55, 0.12)",
              background: "var(--surface-2)",
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--accent-blue)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: "var(--accent-blue)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CostDonut({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="donut-layout">
      <div className="h-[190px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={80}
              paddingAngle={3}
              stroke="transparent"
            >
              {data.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: unknown, name: unknown) => [fmtEur(Number(value ?? 0)), String(name ?? "")]}
              contentStyle={{
                borderRadius: 14,
                border: "1px solid rgba(22, 35, 55, 0.12)",
                background: "var(--surface-2)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="donut-meta">
        <p className="donut-total">{fmtEur(total)}</p>
        <div className="donut-legend">
          {data.map((item, index) => (
            <div key={item.name} className="donut-legend-row">
              <span className="donut-dot" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
              <span>{item.name}</span>
              <span>{Math.round((item.value / (total || 1)) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="super-dashboard-skeleton"
      >
        <div className="skeleton h-10 w-40 rounded-full" />
        <div className="grid gap-5 md:grid-cols-2">
          <div className="skeleton h-36 rounded-3xl" />
          <div className="skeleton h-36 rounded-3xl" />
        </div>
        <div className="skeleton h-56 rounded-3xl" />
      </motion.div>
    </AnimatePresence>
  );
}

export function EventHint({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/5 px-3 py-1.5 text-xs text-slate-600">
      <Clock3 className="h-3.5 w-3.5" />
      {text}
    </div>
  );
}
