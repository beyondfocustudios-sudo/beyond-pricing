"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, ExternalLink } from "lucide-react";
import { getClientProjects, getProjectMilestones, type PortalMilestone } from "@/lib/portal-data";

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

export default function PortalCalendarPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<Array<PortalMilestone & { projectName: string }>>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const projects = await getClientProjects();
        const all = await Promise.all(
          projects.map(async (project) => {
            const list = await getProjectMilestones(project.id);
            return list.map((milestone) => ({ ...milestone, projectName: project.name }));
          }),
        );

        if (cancelled) return;
        setMilestones(
          all
            .flat()
            .sort((a, b) => {
              const dateA = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
              const dateB = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
              return dateA - dateB;
            }),
        );
      } catch {
        if (!cancelled) setError("Falha ao carregar calendário.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    return milestones.reduce<Record<string, Array<PortalMilestone & { projectName: string }>>>((acc, milestone) => {
      const key = milestone.due_date ? milestone.due_date.slice(0, 10) : "sem-data";
      (acc[key] ??= []).push(milestone);
      return acc;
    }, {});
  }, [milestones]);

  if (loading) return <div className="skeleton h-[72vh] rounded-3xl" />;

  if (error) {
    return (
      <div className="card p-6">
        <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
        <button className="btn btn-secondary mt-3" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="card min-h-[68vh] p-5 lg:h-[calc(100dvh-180px)] lg:overflow-y-auto">
        <h1 className="text-base font-semibold" style={{ color: "var(--text)" }}>Calendarização e milestones</h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>Linha temporal por projeto, com export Google/ICS.</p>

        <div className="mt-4 space-y-4">
          {Object.entries(grouped).map(([day, rows]) => (
            <div key={day} className="space-y-2">
              <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>
                {day === "sem-data" ? "Sem data" : new Date(day).toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long" })}
              </p>

              {rows.map((row) => {
                const startIso = row.due_date ? new Date(row.due_date).toISOString() : new Date().toISOString();
                const endIso = row.due_date ? new Date(new Date(row.due_date).getTime() + 30 * 60 * 1000).toISOString() : new Date(Date.now() + 30 * 60 * 1000).toISOString();
                return (
                  <article key={row.id} className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{row.title}</p>
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>{row.projectName} • {row.phase ?? "fase"}</p>
                      </div>
                      <span className="pill text-[10px]">{row.status ?? "pending"}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <a className="btn btn-secondary btn-sm" href={buildGoogleLink(row.title, startIso, endIso, row.description ?? undefined)} target="_blank" rel="noreferrer">
                        <CalendarDays className="h-4 w-4" /> Add to Google
                      </a>
                      <a className="btn btn-ghost btn-sm" href={toIcsLink(row.title, startIso, endIso, row.description ?? undefined)}>
                        <Download className="h-4 w-4" /> Download ICS
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}

          {milestones.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
              Sem milestones configurados.
            </div>
          ) : null}
        </div>
      </section>

      <aside className="card p-5">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Marcar call</h2>
        <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>Usa o calendário para agendar uma call de alinhamento.</p>
        <a className="btn btn-primary btn-sm mt-3 w-full" href={process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com"} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" /> Abrir Calendly
        </a>
      </aside>
    </div>
  );
}
