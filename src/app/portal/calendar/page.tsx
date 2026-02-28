"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, MessageSquare, Send, X, Zap } from "lucide-react";
import {
  getClientProjects,
  getConversationForProject,
  getMessages,
  getProjectMilestones,
  sendConversationMessage,
  type PortalMessage,
  type PortalMilestone,
  type PortalProject,
} from "@/lib/portal-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeFilter = "year" | "week" | "day";
type MilestoneVariant = "done" | "active" | "upcoming" | "future";
type MessageGroup = { date: string; messages: PortalMessage[] };

// ─── Constants ────────────────────────────────────────────────────────────────

const SPRING = { type: "spring" as const, stiffness: 290, damping: 28, mass: 0.85 };
const BLUE = "#2F6BFF";

const AVATAR_COLORS: Array<{ bg: string; text: string }> = [
  { bg: "#FFE4CC", text: "#C05621" },
  { bg: "#DBEAFE", text: "#1E40AF" },
  { bg: "#EDE9FE", text: "#5B21B6" },
  { bg: "#D1FAE5", text: "#065F46" },
  { bg: "#FCE7F3", text: "#9D174D" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarColor(name: string): { bg: string; text: string } {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

function fmtDate(iso: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-PT", opts ?? { day: "2-digit", month: "short" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function fmtMsgDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" });
}

function getMilestoneVariant(status: string | null): MilestoneVariant {
  const s = (status ?? "pending").toLowerCase();
  if (s === "done" || s === "completed") return "done";
  if (s === "in_progress" || s === "active") return "active";
  if (s === "blocked" || s === "at_risk" || s === "at-risk") return "upcoming";
  return "future";
}

function computeTimelineRange(
  milestones: PortalMilestone[],
  filter: TimeFilter,
): { start: Date; end: Date } {
  const now = new Date();

  if (filter === "day") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (filter === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  // Year: span across milestone dates
  const dates = milestones
    .filter((m) => m.due_date)
    .map((m) => new Date(m.due_date!).getTime());

  if (dates.length === 0) {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31),
    };
  }

  const minMs = Math.min(...dates);
  const maxMs = Math.max(...dates);
  const pad = Math.max((maxMs - minMs) * 0.12, 15 * 24 * 60 * 60 * 1000);
  return {
    start: new Date(minMs - pad),
    end: new Date(maxMs + pad),
  };
}

function dateToPercent(date: Date, start: Date, end: Date): number {
  const total = end.getTime() - start.getTime();
  if (total === 0) return 50;
  return Math.max(2, Math.min(98, ((date.getTime() - start.getTime()) / total) * 100));
}

function getMonthLabels(
  start: Date,
  end: Date,
): Array<{ label: string; left: number }> {
  const labels: Array<{ label: string; left: number }> = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    labels.push({
      label: cur.toLocaleDateString("en-US", { month: "long" }),
      left: dateToPercent(cur, start, end),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return labels;
}

function groupMessages(messages: PortalMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const date = fmtMsgDate(msg.created_at);
    const last = groups.at(-1);
    if (last?.date === date) {
      last.messages.push(msg);
    } else {
      groups.push({ date, messages: [msg] });
    }
  }
  return groups;
}

// ─── MilestoneNode ────────────────────────────────────────────────────────────

const NODE_MARGIN_TOP: Record<MilestoneVariant, string> = {
  done: "-11px",
  active: "-19px",
  upcoming: "-11px",
  future: "-7px",
};

function MilestoneNode({
  milestone,
  left,
  index,
}: {
  milestone: PortalMilestone;
  left: number;
  index: number;
}) {
  const variant = getMilestoneVariant(milestone.status);
  const marginTop = NODE_MARGIN_TOP[variant];
  const dateStr = milestone.due_date
    ? fmtDate(milestone.due_date, { day: "2-digit", month: "short" }).toUpperCase()
    : null;

  return (
    <motion.div
      className="absolute flex flex-col items-center"
      style={{
        left: `${left}%`,
        top: 0,
        transform: "translateX(-50%)",
      }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: variant === "future" ? 0.4 : 1, y: 0 }}
      transition={{ ...SPRING, delay: index * 0.06 }}
    >
      {/* Node circle — centered on the 1px bar via marginTop */}
      <div style={{ marginTop }}>
        {variant === "done" && (
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-white shadow-md"
            style={{ background: BLUE }}
          >
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </div>
        )}

        {variant === "active" && (
          <div
            className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white shadow-lg"
            style={{ borderColor: BLUE, zIndex: 20 }}
          >
            <Zap className="h-5 w-5" style={{ color: BLUE }} />
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-20"
              style={{ background: BLUE }}
            />
          </div>
        )}

        {variant === "upcoming" && (
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white shadow-sm"
            style={{ borderColor: BLUE }}
          >
            <Clock className="h-3 w-3" style={{ color: BLUE }} />
          </div>
        )}

        {variant === "future" && (
          <div
            className="h-4 w-4 rounded-full border-2 border-white shadow-sm"
            style={{ background: "#D1D5DB" }}
          />
        )}
      </div>

      {/* Label below the node */}
      <div className="mt-3 w-28 text-center">
        <p className="text-[11px] font-bold leading-tight" style={{ color: "var(--text)" }}>
          {milestone.title}
        </p>
        {dateStr && (
          <p className="mt-0.5 text-[9px]" style={{ color: "var(--text-3)" }}>
            {dateStr}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PortalCalendarPage() {
  const [filter, setFilter] = useState<TimeFilter>("year");
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [milestones, setMilestones] = useState<PortalMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Inbox
  const [inboxOpen, setInboxOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // ── Load projects on mount ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await getClientProjects();
      if (cancelled) return;
      setProjects(list);
      if (list[0]) setSelectedId(list[0].id);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load milestones + conversation when project changes ───────────────────
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingDetail(true);
    setMilestones([]);
    setMessages([]);
    setConversationId(null);

    void (async () => {
      const [milestoneRows, convId] = await Promise.all([
        getProjectMilestones(selectedId),
        getConversationForProject(selectedId),
      ]);
      if (cancelled) return;

      setMilestones(
        [...milestoneRows].sort((a, b) => {
          const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return da - db;
        }),
      );
      setConversationId(convId);
      setLoadingDetail(false);

      if (convId) {
        const msgs = await getMessages(convId);
        if (!cancelled) setMessages(msgs);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // ── Auto-scroll inbox to latest message ───────────────────────────────────
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!conversationId || !msgText.trim()) return;
    setSending(true);
    const ok = await sendConversationMessage(conversationId, msgText.trim());
    if (ok) {
      setMsgText("");
      const msgs = await getMessages(conversationId);
      setMessages(msgs);
    }
    setSending(false);
  }, [conversationId, msgText]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const otherProjects = useMemo(
    () => projects.filter((p) => p.id !== selectedId),
    [projects, selectedId],
  );

  const doneCount = useMemo(
    () => milestones.filter((m) => getMilestoneVariant(m.status) === "done").length,
    [milestones],
  );

  const { monthLabels, nodePositions, progressPct } = useMemo(() => {
    const r = computeTimelineRange(milestones, filter);
    const labels = getMonthLabels(r.start, r.end);
    const positions = milestones.map((m) => ({
      milestone: m,
      left: m.due_date ? dateToPercent(new Date(m.due_date), r.start, r.end) : 50,
    }));
    const pct =
      milestones.length > 0
        ? (doneCount / milestones.length) * 100
        : dateToPercent(new Date(), r.start, r.end);
    return { monthLabels: labels, nodePositions: positions, progressPct: pct };
  }, [milestones, filter, doneCount]);

  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return <div className="skeleton h-[70vh] rounded-3xl" />;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Main content area ── */}
      <div
        className="space-y-10"
        style={{
          paddingRight: inboxOpen ? "440px" : "0",
          transition: "padding-right 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Project header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: BLUE }}
            >
              <Zap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold" style={{ color: "var(--text)" }}>
                {selectedProject?.name ?? "—"}
              </h1>
              <p
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--text-3)" }}
              >
                {selectedProject?.status ?? "active"}
              </p>
            </div>
          </div>

          <button
            onClick={() => setInboxOpen((v) => !v)}
            className="flex flex-shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all"
            style={{
              background: BLUE,
              boxShadow: `0 4px 14px rgba(47,107,255,0.35)`,
            }}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Inbox</span>
          </button>
        </div>

        {/* ── Milestones section ── */}
        <section>
          {/* Section header */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: "var(--text)" }}>
                Milestones
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--text-3)" }}>
                <span style={{ color: BLUE, fontWeight: 600 }}>
                  {doneCount} de {milestones.length}
                </span>{" "}
                milestones completos
              </p>
            </div>

            {/* Year / Week / Day filter */}
            <div
              className="flex items-center rounded-xl p-1"
              style={{ background: "var(--surface-2)" }}
            >
              {(["year", "week", "day"] as TimeFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="rounded-lg px-5 py-2 text-sm font-semibold capitalize transition-all"
                  style={{
                    background: filter === f ? BLUE : "transparent",
                    color: filter === f ? "#ffffff" : "var(--text-3)",
                    boxShadow: filter === f ? "0 2px 8px rgba(47,107,255,0.35)" : "none",
                  }}
                >
                  {f === "year" ? "Year" : f === "week" ? "Week" : "Day"}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          {loadingDetail ? (
            <div className="skeleton h-36 rounded-2xl" />
          ) : (
            <div className="relative overflow-visible px-4 pb-20 pt-4">
              {/* Faded month labels — decorative background text */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {monthLabels.map((m, i) => (
                  <span
                    key={`${m.label}-${i}`}
                    className="absolute top-2 text-4xl font-black uppercase tracking-widest"
                    style={{
                      left: `${m.left}%`,
                      color: "var(--text)",
                      opacity: 0.04,
                    }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>

              {/* Timeline track (1px bar) */}
              <div className="relative mt-14" style={{ height: "1px" }}>
                {/* Track background */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: `rgba(47,107,255,0.18)` }}
                />

                {/* Animated progress fill */}
                <motion.div
                  className="absolute left-0 rounded-full"
                  style={{
                    top: "-1.5px",
                    height: "4px",
                    background: BLUE,
                  }}
                  initial={{ width: "0%" }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ ...SPRING, delay: 0.2 }}
                />

                {/* Milestone nodes */}
                {nodePositions.map(({ milestone, left }, i) => (
                  <MilestoneNode
                    key={milestone.id}
                    milestone={milestone}
                    left={left}
                    index={i}
                  />
                ))}
              </div>

              {milestones.length === 0 && (
                <div
                  className="mt-16 rounded-xl border border-dashed p-4 text-center text-xs"
                  style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
                >
                  Sem milestones neste projeto.
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Other Projects ── */}
        {otherProjects.length > 0 && (
          <section className="pb-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold" style={{ color: "var(--text)" }}>
                Outros Projetos
              </h2>
            </div>

            <div className="space-y-3">
              {otherProjects.map((p) => {
                const initStr = initials(p.name);
                const color = avatarColor(p.name);

                return (
                  <motion.button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className="flex w-full items-center justify-between rounded-2xl p-4 text-left"
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                    }}
                    whileHover={{ scale: 1.005 }}
                    transition={SPRING}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div
                        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-lg font-bold"
                        style={{ background: color.bg, color: color.text }}
                      >
                        {initStr}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-bold" style={{ color: "var(--text)" }}>
                          {p.name}
                        </h3>
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>
                          {p.status ?? "active"}
                        </p>
                      </div>
                    </div>

                    <div className="ml-4 flex flex-shrink-0 items-center gap-4 sm:gap-6">
                      <span
                        className="hidden rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider sm:block"
                        style={{
                          background: `rgba(47,107,255,0.10)`,
                          color: BLUE,
                        }}
                      >
                        {p.status?.toUpperCase() ?? "ATIVO"}
                      </span>
                      <div className="text-right">
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                          {fmtDate(p.updated_at, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                        <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
                          {fmtTime(p.updated_at)}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* ── Inbox drawer (fixed right panel) ── */}
      <AnimatePresence>
        {inboxOpen && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              className="fixed inset-0 z-40 bg-black/20 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInboxOpen(false)}
            />

            <motion.aside
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l shadow-2xl"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={SPRING}
            >
              {/* Inbox header */}
              <div
                className="flex flex-shrink-0 items-center justify-between border-b px-6 py-5"
                style={{ borderColor: "var(--border)" }}
              >
                <h2
                  className="text-xs font-bold uppercase tracking-[2px]"
                  style={{ color: "var(--text-3)" }}
                >
                  Inbox
                </h2>
                <button
                  onClick={() => setInboxOpen(false)}
                  className="icon-btn"
                  aria-label="Fechar inbox"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Message thread */}
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                {messageGroups.length === 0 && (
                  <p
                    className="rounded-xl border border-dashed p-4 text-center text-xs"
                    style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
                  >
                    {conversationId
                      ? "Sem mensagens ainda."
                      : "Sem conversa para este projeto."}
                  </p>
                )}

                {messageGroups.map((group) => (
                  <div key={group.date} className="space-y-4">
                    {/* Date divider */}
                    <div className="flex items-center gap-3 opacity-40">
                      <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                      <span
                        className="text-[10px] font-bold uppercase"
                        style={{ color: "var(--text-3)" }}
                      >
                        {group.date}
                      </span>
                      <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                    </div>

                    {/* Chat bubbles */}
                    {group.messages.map((msg) => {
                      const isTeam = msg.sender_type === "team";
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-3 ${isTeam ? "" : "flex-row-reverse"}`}
                        >
                          {/* Avatar */}
                          <div
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                            style={{
                              background: isTeam ? BLUE : "var(--surface-2)",
                              color: isTeam ? "#fff" : "var(--text-2)",
                            }}
                          >
                            {isTeam ? "BP" : "C"}
                          </div>

                          {/* Bubble */}
                          <div
                            className={`max-w-[75%] space-y-1 ${isTeam ? "" : "flex flex-col items-end"}`}
                          >
                            <div
                              className={`flex items-center gap-2 ${isTeam ? "" : "flex-row-reverse"}`}
                            >
                              <p
                                className="text-xs font-bold"
                                style={{ color: "var(--text)" }}
                              >
                                {isTeam ? "Beyond Pricing" : "You"}
                              </p>
                              <span
                                className="text-[9px]"
                                style={{ color: "var(--text-3)" }}
                              >
                                {fmtTime(msg.created_at)}
                              </span>
                            </div>
                            <div
                              className="p-3.5 text-sm leading-relaxed"
                              style={{
                                background: isTeam
                                  ? "var(--surface-2)"
                                  : `rgba(47,107,255,0.10)`,
                                color: "var(--text-2)",
                                border: "1px solid var(--border)",
                                borderRadius: isTeam
                                  ? "16px 16px 16px 4px"
                                  : "16px 16px 4px 16px",
                              }}
                            >
                              {msg.body}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                <div ref={endRef} />
              </div>

              {/* Message input */}
              <div
                className="flex-shrink-0 border-t p-5"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex gap-3">
                  <input
                    className="flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--surface-2)",
                      color: "var(--text)",
                    }}
                    placeholder="Escreve uma mensagem…"
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    disabled={!conversationId}
                  />
                  <button
                    onClick={() => void handleSend()}
                    disabled={!conversationId || !msgText.trim() || sending}
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white shadow transition disabled:opacity-40"
                    style={{ background: BLUE }}
                    aria-label="Enviar mensagem"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
