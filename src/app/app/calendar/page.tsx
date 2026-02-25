"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

type CalendarView = "month" | "week" | "day" | "agenda";

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  type: "shoot" | "meeting" | "review" | "delivery" | "travel" | "other";
  status: "confirmed" | "tentative" | "cancelled";
  meeting_url: string | null;
  project_id: string | null;
  calendar_id: string | null;
  timezone: string;
};

type EventForm = {
  id?: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  type: CalendarEvent["type"];
  status: CalendarEvent["status"];
  meetingUrl: string;
};

const VIEW_LABELS: Record<CalendarView, string> = {
  month: "Mês",
  week: "Semana",
  day: "Dia",
  agenda: "Agenda",
};

function toInputDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function parseLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(date: Date) {
  const base = startOfDay(date);
  const weekDay = (base.getDay() + 6) % 7; // monday=0
  base.setDate(base.getDate() - weekDay);
  return base;
}

function endOfWeek(date: Date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return endOfDay(end);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function rangeForView(view: CalendarView, anchor: Date) {
  if (view === "day") {
    return { from: startOfDay(anchor), to: endOfDay(anchor) };
  }
  if (view === "week") {
    return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
  }
  if (view === "agenda") {
    const from = startOfDay(anchor);
    const to = new Date(from);
    to.setDate(to.getDate() + 45);
    return { from, to: endOfDay(to) };
  }

  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const from = startOfWeek(monthStart);
  const to = endOfWeek(monthEnd);
  return { from, to };
}

function formatDateHeading(view: CalendarView, anchor: Date) {
  if (view === "day") {
    return anchor.toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  }
  if (view === "week") {
    const from = startOfWeek(anchor);
    const to = endOfWeek(anchor);
    return `${from.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })} — ${to.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })}`;
  }
  return anchor.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

function shiftAnchor(view: CalendarView, anchor: Date, direction: -1 | 1) {
  const next = new Date(anchor);
  if (view === "day") {
    next.setDate(next.getDate() + direction);
  } else if (view === "week") {
    next.setDate(next.getDate() + direction * 7);
  } else if (view === "agenda") {
    next.setDate(next.getDate() + direction * 14);
  } else {
    next.setMonth(next.getMonth() + direction);
  }
  return next;
}

function groupEventsByDate(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const day = event.starts_at.slice(0, 10);
    const list = map.get(day) ?? [];
    list.push(event);
    map.set(day, list.sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
  }
  return map;
}

function toGoogleCalendarUrl(event: CalendarEvent) {
  const start = new Date(event.starts_at).toISOString().replace(/[-:]/g, "").replace(".000", "");
  const end = new Date(event.ends_at).toISOString().replace(/[-:]/g, "").replace(".000", "");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
  });

  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") throw new Error("Clipboard indisponivel");

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Falha ao copiar");
}

function eventTypeLabel(type: CalendarEvent["type"]) {
  switch (type) {
    case "shoot": return "Shoot";
    case "meeting": return "Reunião";
    case "review": return "Review";
    case "delivery": return "Entrega";
    case "travel": return "Travel";
    default: return "Outro";
  }
}

export default function AppCalendarPage() {
  const [view, setView] = useState<CalendarView>("month");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>({
    title: "",
    description: "",
    location: "",
    startsAt: "",
    endsAt: "",
    type: "meeting",
    status: "confirmed",
    meetingUrl: "",
  });

  const [feedToken, setFeedToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");

  const { from, to } = useMemo(() => rangeForView(view, anchorDate), [view, anchorDate]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const res = await fetch(`/api/calendar/events?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { error?: string; events?: CalendarEvent[] };
      if (!res.ok) throw new Error(json.error ?? "Falha ao carregar calendário");
      setEvents(json.events ?? []);
    } catch (error) {
      setEvents([]);
      setLoadError(error instanceof Error ? error.message : "Falha ao carregar calendário");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const ensureFeedToken = useCallback(async () => {
    setTokenLoading(true);
    try {
      const res = await fetch("/api/calendar/feed-token", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { token?: string };
      if (res.ok && json.token) setFeedToken(json.token);
    } finally {
      setTokenLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    void ensureFeedToken();
  }, [ensureFeedToken]);

  const eventsByDay = useMemo(() => groupEventsByDate(events), [events]);

  const monthCells = useMemo(() => {
    const start = startOfWeek(startOfMonth(anchorDate));
    return Array.from({ length: 42 }, (_, idx) => {
      const day = new Date(start);
      day.setDate(start.getDate() + idx);
      return day;
    });
  }, [anchorDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, idx) => {
      const day = new Date(start);
      day.setDate(start.getDate() + idx);
      return day;
    });
  }, [anchorDate]);

  const agendaEvents = useMemo(
    () => [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [events],
  );

  const feedUrl = useMemo(() => {
    if (!feedToken) return "";
    if (typeof window === "undefined") return `/api/calendar/feed.ics?token=${feedToken}`;
    return `${window.location.origin}/api/calendar/feed.ics?token=${feedToken}`;
  }, [feedToken]);

  const quickGoogleHref = useMemo(() => {
    const start = new Date(anchorDate);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: "Evento Beyond Pricing",
      dates: `${start.toISOString().replace(/[-:]/g, "").replace(".000", "")}/${end.toISOString().replace(/[-:]/g, "").replace(".000", "")}`,
      details: "Criado a partir do calendario interno Beyond Pricing.",
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }, [anchorDate]);

  const openCreateModal = (seedDate?: Date) => {
    const start = seedDate ? new Date(seedDate) : new Date(anchorDate);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    setForm({
      title: "",
      description: "",
      location: "",
      startsAt: toInputDateTime(start),
      endsAt: toInputDateTime(end),
      type: "meeting",
      status: "confirmed",
      meetingUrl: "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setForm({
      id: event.id,
      title: event.title,
      description: event.description ?? "",
      location: event.location ?? "",
      startsAt: toInputDateTime(new Date(event.starts_at)),
      endsAt: toInputDateTime(new Date(event.ends_at)),
      type: event.type,
      status: event.status,
      meetingUrl: event.meeting_url ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const saveEvent = async () => {
    if (saving) return;

    const starts = parseLocalDateTime(form.startsAt);
    const ends = parseLocalDateTime(form.endsAt);
    if (!starts || !ends || ends <= starts) {
      setFormError("Datas inválidas (fim deve ser depois do início).");
      return;
    }

    if (!form.title.trim()) {
      setFormError("Título é obrigatório.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      type: form.type,
      status: form.status,
      meetingUrl: form.meetingUrl.trim() || null,
    };

    const method = form.id ? "PATCH" : "POST";
    const body = form.id ? { ...payload, id: form.id } : payload;

    try {
      const res = await fetch("/api/calendar/events", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Falha ao guardar evento");
      setModalOpen(false);
      await loadEvents();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Falha ao guardar evento");
    } finally {
      setSaving(false);
    }
  };

  const removeEvent = async () => {
    if (!form.id || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/calendar/events?id=${encodeURIComponent(form.id)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Falha ao apagar evento");
      setModalOpen(false);
      await loadEvents();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Falha ao apagar evento");
    } finally {
      setDeleting(false);
    }
  };

  const copyFeed = async () => {
    if (!feedUrl) return;
    try {
      await copyText(feedUrl);
      setCopyState("ok");
    } catch {
      setCopyState("error");
    }
    setTimeout(() => setCopyState("idle"), 1500);
  };

  return (
    <div className="space-y-5 pb-8">
      <section className="card rounded-[24px] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
              style={{ borderColor: "var(--border-soft)", background: "color-mix(in srgb, var(--surface-2) 92%, transparent)" }}
            >
              <CalendarDays className="h-4 w-4" style={{ color: "var(--accent-primary)" }} />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>
                Calendar
              </p>
              <h1 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.02em]" style={{ color: "var(--text)" }}>
                Calendário interno
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
                Vistas Month/Week/Day/Agenda com persistência total no Supabase.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setAnchorDate(shiftAnchor(view, anchorDate, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setAnchorDate(new Date())}>
              Hoje
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setAnchorDate(shiftAnchor(view, anchorDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => openCreateModal()}>
              <Plus className="h-4 w-4" />
              Novo evento
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border p-1" style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)" }}>
            {(Object.keys(VIEW_LABELS) as CalendarView[]).map((item) => (
              <button
                key={item}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${view === item ? "" : "opacity-80"}`}
                style={view === item ? { background: "var(--surface)", color: "var(--text)" } : { color: "var(--text-2)" }}
                onClick={() => setView(item)}
              >
                {VIEW_LABELS[item]}
              </button>
            ))}
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {formatDateHeading(view, anchorDate)}
          </p>
        </div>
      </section>

      <section className="card rounded-[24px] p-5 md:p-6">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          Integrações calendário
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="btn btn-secondary btn-sm" href={feedToken ? `/api/calendar/feed.ics?token=${feedToken}` : "/api/calendar/feed.ics"}>
            Download ICS
          </a>
          <button className="btn btn-secondary btn-sm" onClick={() => void copyFeed()} disabled={!feedUrl || tokenLoading}>
            {tokenLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            {copyState === "ok" ? "Copiado" : copyState === "error" ? "Falha ao copiar" : "Copiar link ICS"}
          </button>
          {feedUrl ? (
            <a className="btn btn-secondary btn-sm" href={feedUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Abrir link ICS
            </a>
          ) : null}
          <a className="btn btn-secondary btn-sm" href={quickGoogleHref} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            Adicionar ao Google Calendar
          </a>
        </div>
        <p className="mt-3 text-xs break-all" style={{ color: "var(--text-3)" }}>
          {feedUrl || "A gerar token de feed..."}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
          Google: abre o link para criar um evento. Apple/Outlook: usa o link ICS em subscricao.
        </p>
      </section>

      <section className="card rounded-[24px] p-4 md:p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar eventos...
          </div>
        ) : loadError ? (
          <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--warning-border)", background: "var(--warning-bg)", color: "var(--warning)" }}>
            {loadError}
          </div>
        ) : view === "month" ? (
          <div className="grid grid-cols-7 gap-2">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => (
              <div key={day} className="px-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
                {day}
              </div>
            ))}
            {monthCells.map((cell) => {
              const key = cell.toISOString().slice(0, 10);
              const dayEvents = eventsByDay.get(key) ?? [];
              const isCurrentMonth = cell.getMonth() === anchorDate.getMonth();
              return (
                <button
                  key={key}
                  className="min-h-28 rounded-xl border p-2 text-left"
                  style={{
                    borderColor: "var(--border)",
                    background: isCurrentMonth ? "var(--surface-2)" : "color-mix(in srgb, var(--surface-2) 72%, transparent)",
                  }}
                  onClick={() => openCreateModal(cell)}
                >
                  <p className="text-xs font-medium" style={{ color: isCurrentMonth ? "var(--text)" : "var(--text-3)" }}>
                    {cell.getDate()}
                  </p>
                  <div className="mt-2 space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        className="block w-full truncate rounded-md px-2 py-1 text-left text-[11px]"
                        style={{ background: "var(--surface)", color: "var(--text)" }}
                        onClick={(eventClick) => {
                          eventClick.stopPropagation();
                          openEditModal(event);
                        }}
                      >
                        {new Date(event.starts_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })} · {event.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 ? (
                      <p className="px-2 text-[11px]" style={{ color: "var(--text-3)" }}>
                        +{dayEvents.length - 3} eventos
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : view === "week" ? (
          <div className="grid gap-3 lg:grid-cols-7">
            {weekDays.map((day) => {
              const key = day.toISOString().slice(0, 10);
              const dayEvents = eventsByDay.get(key) ?? [];
              return (
                <div key={key} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                    {day.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit" })}
                  </p>
                  <div className="mt-2 space-y-2">
                    {dayEvents.length === 0 ? (
                      <button className="text-xs underline" style={{ color: "var(--text-3)" }} onClick={() => openCreateModal(day)}>
                        + Novo evento
                      </button>
                    ) : (
                      dayEvents.map((event) => (
                        <button
                          key={event.id}
                          className="w-full rounded-lg border p-2 text-left"
                          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                          onClick={() => openEditModal(event)}
                        >
                          <p className="line-clamp-1 text-xs font-medium" style={{ color: "var(--text)" }}>{event.title}</p>
                          <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                            {new Date(event.starts_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                            <a
                              href={toGoogleCalendarUrl(event)}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                              style={{ color: "var(--accent-primary)" }}
                              onClick={(eventClick) => eventClick.stopPropagation()}
                            >
                              Adicionar ao Google
                            </a>
                            <a
                              href={`/api/calendar/event.ics?id=${event.id}`}
                              className="underline"
                              style={{ color: "var(--text-3)" }}
                              onClick={(eventClick) => eventClick.stopPropagation()}
                            >
                              Download ICS
                            </a>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : view === "day" ? (
          <div className="space-y-3">
            {(eventsByDay.get(anchorDate.toISOString().slice(0, 10)) ?? []).length === 0 ? (
              <button className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--surface-2)" }} onClick={() => openCreateModal(anchorDate)}>
                Sem eventos neste dia. Clica para criar.
              </button>
            ) : (
              (eventsByDay.get(anchorDate.toISOString().slice(0, 10)) ?? []).map((event) => (
                <article key={event.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{event.title}</p>
                      <p className="text-xs" style={{ color: "var(--text-3)" }}>
                        {eventTypeLabel(event.type)} · {new Date(event.starts_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })} - {new Date(event.ends_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a className="btn btn-ghost btn-sm" href={`/api/calendar/event.ics?id=${event.id}`}>
                        ICS
                      </a>
                      <a className="btn btn-ghost btn-sm" href={toGoogleCalendarUrl(event)} target="_blank" rel="noreferrer">
                        Adicionar ao Google
                      </a>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(event)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    </div>
                  </div>
                  {event.description ? <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>{event.description}</p> : null}
                  {event.location ? <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>{event.location}</p> : null}
                </article>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {agendaEvents.length === 0 ? (
              <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--surface-2)" }}>
                Sem eventos na agenda.
              </div>
            ) : (
              agendaEvents.map((event) => (
                <button
                  key={event.id}
                  className="w-full rounded-xl border p-3 text-left"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                  onClick={() => openEditModal(event)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{event.title}</p>
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>{eventTypeLabel(event.type)}</span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                    {new Date(event.starts_at).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" })} · {new Date(event.starts_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <a
                      href={toGoogleCalendarUrl(event)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                      style={{ color: "var(--accent-primary)" }}
                      onClick={(eventClick) => eventClick.stopPropagation()}
                    >
                      Adicionar ao Google
                    </a>
                    <a
                      href={`/api/calendar/event.ics?id=${event.id}`}
                      className="underline"
                      style={{ color: "var(--text-3)" }}
                      onClick={(eventClick) => eventClick.stopPropagation()}
                    >
                      Download ICS
                    </a>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}>
          <div className="w-full max-w-xl rounded-2xl border p-5" style={{ borderColor: "var(--border-soft)", background: "var(--surface)" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {form.id ? "Editar evento" : "Novo evento"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  Timezone Europe/Lisbon
                </p>
              </div>
              <button className="btn btn-ghost btn-icon-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <div className="mt-4 space-y-3">
              <input className="input" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Título" />
              <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Descrição" style={{ resize: "none" }} />
              <input className="input" value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} placeholder="Local" />

              <div className="grid gap-2 md:grid-cols-2">
                <input type="datetime-local" className="input" value={form.startsAt} onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))} />
                <input type="datetime-local" className="input" value={form.endsAt} onChange={(e) => setForm((prev) => ({ ...prev, endsAt: e.target.value }))} />
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <select className="input" value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as CalendarEvent["type"] }))}>
                  <option value="meeting">Reunião</option>
                  <option value="shoot">Shoot</option>
                  <option value="review">Review</option>
                  <option value="delivery">Entrega</option>
                  <option value="travel">Travel</option>
                  <option value="other">Outro</option>
                </select>
                <select className="input" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as CalendarEvent["status"] }))}>
                  <option value="confirmed">Confirmado</option>
                  <option value="tentative">Tentativo</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              <input className="input" value={form.meetingUrl} onChange={(e) => setForm((prev) => ({ ...prev, meetingUrl: e.target.value }))} placeholder="Meeting URL (opcional)" />

              {formError ? (
                <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--warning-border)", background: "var(--warning-bg)", color: "var(--warning)" }}>
                  {formError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div>
                  {form.id ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => void removeEvent()} disabled={deleting}>
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Apagar
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={() => void saveEvent()} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
