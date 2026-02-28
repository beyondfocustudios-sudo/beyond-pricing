"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Paperclip,
  Plus,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
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

type TimeFilter = "Year" | "Week" | "Day";
type MilestoneStatus = "completed" | "active" | "upcoming";
type LocalMilestone = PortalMilestone & { localStatus: MilestoneStatus };
type MessageGroup = { date: string; messages: PortalMessage[] };

// ─── Constants ────────────────────────────────────────────────────────────────

const SPRING = { type: "spring" as const, stiffness: 290, damping: 28, mass: 0.85 };
const BLUE = "#2F6BFF";
const DARK = "#0F172A";
const MONTH_LABELS = ["FEBRUARY", "MARCH", "APRIL", "MAY"];

const AVATAR_COLORS: Array<{ bg: string; text: string }> = [
  { bg: "#FFE4CC", text: "#C05621" },
  { bg: "#DBEAFE", text: "#1E40AF" },
  { bg: "#EDE9FE", text: "#5B21B6" },
  { bg: "#D1FAE5", text: "#065F46" },
  { bg: "#FCE7F3", text: "#9D174D" },
  { bg: "#FEF3C7", text: "#92400E" },
  { bg: "#CFFAFE", text: "#155E75" },
];

const MOCK_TEAM = ["Ana Costa", "Bruno Ferreira", "Catarina Lima", "Diogo Santos"];

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

function fmtMilestoneDate(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")} ${d
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase()}`;
}

function getMilestoneStatus(status: string | null): MilestoneStatus {
  const s = (status ?? "pending").toLowerCase();
  if (s === "done" || s === "completed") return "completed";
  if (s === "in_progress" || s === "active") return "active";
  return "upcoming";
}

function getStatusBadge(status: string | null): { label: string; cls: string } {
  const s = (status ?? "active").toLowerCase();
  if (s === "done" || s === "completed" || s === "concluído" || s === "concluido") {
    return { label: "Concluído", cls: "bg-slate-100 text-slate-500" };
  }
  if (s === "planning" || s === "planeamento" || s === "draft" || s === "pending") {
    return { label: "Planeamento", cls: "bg-blue-100 text-blue-600" };
  }
  return { label: "Ativo", cls: "bg-emerald-100 text-emerald-600" };
}

function groupMessages(messages: PortalMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const date = fmtMsgDate(msg.created_at);
    const last = groups.at(-1);
    if (last?.date === date) last.messages.push(msg);
    else groups.push({ date, messages: [msg] });
  }
  return groups;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PortalCalendarPage() {
  const [activeTab, setActiveTab] = useState<TimeFilter>("Year");
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [milestones, setMilestones] = useState<LocalMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Inbox
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // ── Load projects ─────────────────────────────────────────────────────────
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

  // ── Load milestones + conversation on project change ──────────────────────
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingDetail(true);
    setMilestones([]);
    setMessages([]);
    setConversationId(null);

    void (async () => {
      const [rows, convId] = await Promise.all([
        getProjectMilestones(selectedId),
        getConversationForProject(selectedId),
      ]);
      if (cancelled) return;

      setMilestones(
        [...rows]
          .sort((a, b) => {
            const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
            const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
            return da - db;
          })
          .map((m) => ({ ...m, localStatus: getMilestoneStatus(m.status) })),
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

  // ── Auto-scroll inbox ─────────────────────────────────────────────────────
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Toggle milestone status (local only, optimistic) ─────────────────────
  const toggleMilestone = useCallback((id: string) => {
    setMilestones((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const next: MilestoneStatus =
          m.localStatus === "completed"
            ? "upcoming"
            : m.localStatus === "upcoming"
              ? "active"
              : "completed";
        return { ...m, localStatus: next };
      }),
    );
  }, []);

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

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const completedCount = useMemo(
    () => milestones.filter((m) => m.localStatus === "completed").length,
    [milestones],
  );

  const filteredMilestones = useMemo(() => {
    if (activeTab === "Day") return milestones.slice(0, 1);
    if (activeTab === "Week") return milestones.slice(0, 2);
    return milestones;
  }, [milestones, activeTab]);

  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  // Team avatars seeded from project name
  const teamAvatars = useMemo(() => {
    if (!selectedProject) return MOCK_TEAM.slice(0, 4);
    let seed = 0;
    for (const c of selectedProject.name) seed = (seed * 31 + c.charCodeAt(0)) & 0xffff;
    return [0, 1, 2, 3].map((i) => MOCK_TEAM[(seed + i) % MOCK_TEAM.length]!);
  }, [selectedProject]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return <div className="skeleton h-[70vh] rounded-3xl" />;

  // ── Render ────────────────────────────────────────────────────────────────
  //
  // Break out of the layout's px-4/px-6/px-8 and py-4/py-6 padding so we
  // can build a true 2-column layout (main scroll | fixed inbox) that fills
  // the full remaining viewport height below the portal header (≈74px).
  //
  return (
    <div
      className="-mx-4 sm:-mx-6 lg:-mx-8 -my-4 lg:-my-6 flex overflow-hidden"
      style={{ height: "calc(100dvh - 74px)" }}
    >
      {/* ── Left: scrollable main content ────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
        <div className="space-y-10">
          {/* ── Project header ── */}
          <header className="flex items-center justify-between gap-4">
            {/* Left: burger icon + animated project name */}
            <div className="flex min-w-0 items-center gap-4">
              <div
                className="flex-shrink-0 rounded-lg p-2"
                style={{ background: `rgba(47,107,255,0.08)`, color: BLUE }}
              >
                <div className="flex h-6 w-6 flex-col justify-center gap-1">
                  <div className="h-0.5 w-full rounded-full bg-current" />
                  <div className="h-0.5 w-2/3 rounded-full bg-current" />
                  <div className="h-0.5 w-full rounded-full bg-current" />
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedProject?.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  className="min-w-0"
                >
                  <h1
                    className="truncate text-xl font-bold leading-tight"
                    style={{ color: "var(--text)" }}
                  >
                    {selectedProject?.name ?? "—"}
                  </h1>
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: "var(--text-3)" }}
                  >
                    {selectedProject?.description ?? selectedProject?.status ?? "active"}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Right: avatar stack + add-milestone button */}
            <div className="flex flex-shrink-0 items-center gap-4">
              <div className="flex -space-x-2">
                {teamAvatars.map((name, i) => {
                  const col = avatarColor(name);
                  return (
                    <div
                      key={i}
                      title={name}
                      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold"
                      style={{
                        background: col.bg,
                        color: col.text,
                        zIndex: teamAvatars.length - i,
                      }}
                    >
                      {initials(name)}
                    </div>
                  );
                })}
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold"
                  style={{ background: "var(--surface-2)", color: "var(--text-3)", zIndex: 0 }}
                >
                  +5
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lg"
                style={{ background: BLUE, boxShadow: `0 4px 14px rgba(47,107,255,0.35)` }}
                aria-label="Adicionar milestone"
              >
                <Plus size={22} />
              </motion.button>
            </div>
          </header>

          {/* ── Milestones section ── */}
          <section>
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2
                  className="mb-1 text-2xl font-bold"
                  style={{ color: "var(--text)" }}
                >
                  Milestones
                </h2>
                <p className="text-sm" style={{ color: "var(--text-3)" }}>
                  <span style={{ color: BLUE, fontWeight: 700 }}>
                    {completedCount} of {milestones.length}
                  </span>{" "}
                  milestones complete
                </p>
              </div>

              {/* Year / Week / Day */}
              <div
                className="flex items-center rounded-xl p-1"
                style={{ background: "var(--surface-2)" }}
              >
                {(["Year", "Week", "Day"] as TimeFilter[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="rounded-lg px-6 py-2 text-xs font-bold transition-all"
                    style={{
                      background: activeTab === tab ? "var(--surface)" : "transparent",
                      color: activeTab === tab ? BLUE : "var(--text-3)",
                      boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {loadingDetail ? (
              <div className="skeleton h-36 rounded-2xl" />
            ) : (
              <div className="relative pb-12 pt-12">
                {/* Faded month labels */}
                <div className="pointer-events-none absolute inset-0 flex justify-between overflow-hidden px-4">
                  {MONTH_LABELS.map((m) => (
                    <span
                      key={m}
                      className="text-5xl font-black tracking-[0.15em]"
                      style={{ color: "var(--text)", opacity: 0.03 }}
                    >
                      {m}
                    </span>
                  ))}
                </div>

                {/* Timeline bar */}
                <div
                  className="relative mx-8 h-1 rounded-full"
                  style={{ background: "var(--surface-2)" }}
                >
                  {/* Animated progress fill */}
                  <motion.div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{ background: BLUE }}
                    initial={{ width: "0%" }}
                    animate={{
                      width:
                        milestones.length > 0
                          ? `${(completedCount / milestones.length) * 100}%`
                          : "0%",
                    }}
                    transition={{ ...SPRING, delay: 0.15 }}
                  />

                  {/* Milestone nodes — evenly spaced (flex justify-between) */}
                  {filteredMilestones.length > 0 && (
                    <div className="absolute top-1/2 w-full -translate-y-1/2">
                      <div className="flex w-full items-center justify-between">
                        <AnimatePresence>
                          {filteredMilestones.map((m, idx) => {
                            const st = m.localStatus;
                            return (
                              <motion.div
                                key={m.id}
                                className="group relative flex flex-col items-center"
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                transition={{ ...SPRING, delay: idx * 0.08 }}
                              >
                                {/* Node button */}
                                <motion.button
                                  whileHover={{ scale: 1.2 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => toggleMilestone(m.id)}
                                  className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
                                  style={{
                                    border: "4px solid var(--surface)",
                                    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                                    background:
                                      st === "completed"
                                        ? BLUE
                                        : st === "active"
                                          ? "var(--surface)"
                                          : "var(--surface-2)",
                                    color:
                                      st === "completed"
                                        ? "#fff"
                                        : st === "active"
                                          ? BLUE
                                          : "var(--text-3)",
                                    outline:
                                      st === "active" ? `2px solid ${BLUE}` : "none",
                                    outlineOffset: "0px",
                                  }}
                                >
                                  {st === "completed" && <CheckCircle2 size={16} />}
                                  {st === "active" && <Zap size={16} fill="currentColor" />}
                                  {st === "upcoming" && (
                                    <Circle
                                      size={8}
                                      style={{ fill: "currentColor", opacity: 0.5 }}
                                    />
                                  )}
                                </motion.button>

                                {/* Label below node */}
                                <div className="absolute top-10 w-32 text-center transition-transform group-hover:scale-105">
                                  <p
                                    className="text-[10px] font-bold uppercase tracking-wider"
                                    style={{
                                      color:
                                        st === "upcoming" ? "var(--text-3)" : "var(--text)",
                                    }}
                                  >
                                    {m.title}
                                  </p>
                                  <p
                                    className="mt-0.5 text-[9px] font-bold"
                                    style={{ color: "var(--text-3)" }}
                                  >
                                    {fmtMilestoneDate(m.due_date)}
                                  </p>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {milestones.length === 0 && (
                    <p
                      className="absolute left-0 top-6 w-full rounded-xl border border-dashed py-4 text-center text-xs"
                      style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
                    >
                      Sem milestones neste projeto.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── Other Projects ── */}
          {projects.length > 0 && (
            <section className="pb-6 pt-4">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold" style={{ color: "var(--text)" }}>
                  Other Projects
                </h2>
                <Link
                  href="/portal/projects"
                  className="text-xs font-bold hover:underline"
                  style={{ color: BLUE }}
                >
                  View All
                </Link>
              </div>

              <div className="space-y-4">
                {projects.map((p, idx) => {
                  const isSelected = p.id === selectedId;
                  const badge = getStatusBadge(p.status);
                  const col = avatarColor(p.name);

                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0, scale: isSelected ? 1.01 : 1 }}
                      transition={{ delay: 0.1 + idx * 0.08 }}
                      whileHover={isSelected ? {} : { x: 4 }}
                      onClick={() => setSelectedId(p.id)}
                      className="flex cursor-pointer items-center justify-between rounded-2xl p-5 transition-all"
                      style={{
                        background: isSelected ? DARK : "var(--surface)",
                        border: isSelected ? "none" : "1px solid var(--border)",
                        boxShadow: isSelected
                          ? "0 8px 32px rgba(15,23,42,0.25)"
                          : "none",
                      }}
                    >
                      {/* Left: initials + name + type */}
                      <div className="flex min-w-0 items-center gap-4">
                        <div
                          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                          style={{
                            background: isSelected ? "rgba(255,255,255,0.1)" : col.bg,
                            color: isSelected ? "#fff" : col.text,
                          }}
                        >
                          {initials(p.name)}
                        </div>
                        <div className="min-w-0">
                          <h3
                            className="truncate font-bold text-sm"
                            style={{ color: isSelected ? "#fff" : "var(--text)" }}
                          >
                            {p.name}
                          </h3>
                          <p
                            className="text-[10px] font-medium"
                            style={{
                              color: isSelected
                                ? "rgba(255,255,255,0.45)"
                                : "var(--text-3)",
                            }}
                          >
                            {p.description ?? badge.label}
                          </p>
                        </div>
                      </div>

                      {/* Right: status badge + date + chevron */}
                      <div className="ml-4 flex flex-shrink-0 items-center gap-5">
                        {!isSelected && (
                          <span
                            className={`hidden rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider sm:block ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        )}
                        <div className="text-right">
                          <p
                            className="text-[10px] font-bold"
                            style={{ color: isSelected ? "#fff" : "var(--text)" }}
                          >
                            {fmtDate(p.updated_at, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </p>
                          <p
                            className="text-[9px] font-medium"
                            style={{
                              color: isSelected
                                ? "rgba(255,255,255,0.45)"
                                : "var(--text-3)",
                            }}
                          >
                            {fmtTime(p.updated_at)}
                          </p>
                        </div>
                        <ChevronRight
                          size={18}
                          style={{
                            color: isSelected ? "rgba(255,255,255,0.4)" : "var(--text-3)",
                          }}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ── Right: Permanent inbox panel ─────────────────────────────────── */}
      <aside
        className="flex w-[380px] flex-shrink-0 flex-col overflow-hidden border-l"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* Inbox header */}
        <div
          className="flex flex-shrink-0 items-center justify-between border-b px-8 py-6"
          style={{ borderColor: "var(--border)" }}
        >
          <h2
            className="text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ color: "var(--text-3)" }}
          >
            Inbox
          </h2>
          <button className="icon-btn" aria-label="Fechar inbox">
            <X size={20} />
          </button>
        </div>

        {/* Messages — animated on project switch */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {messageGroups.length === 0 && (
                <p
                  className="rounded-xl border border-dashed px-4 py-6 text-center text-xs"
                  style={{ borderColor: "var(--border)", color: "var(--text-3)" }}
                >
                  {conversationId
                    ? "Sem mensagens ainda."
                    : "Sem conversa para este projeto."}
                </p>
              )}

              {messageGroups.map((group) => (
                <div key={group.date} className="space-y-6">
                  {/* Date divider */}
                  <div className="flex justify-center">
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest"
                      style={{ color: "var(--text-3)", opacity: 0.5 }}
                    >
                      {group.date}
                    </span>
                  </div>

                  {/* Message bubbles */}
                  {group.messages.map((msg) => {
                    const isTeam = msg.sender_type === "team";
                    const sender = isTeam ? "Beyond Pricing" : "You";
                    const col = avatarColor(sender);
                    return (
                      <div key={msg.id} className="flex gap-4">
                        {/* Avatar */}
                        <div
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                          style={{
                            background: isTeam ? BLUE : col.bg,
                            color: isTeam ? "#fff" : col.text,
                          }}
                        >
                          {isTeam ? "BP" : "Yo"}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span
                              className="text-xs font-bold"
                              style={{ color: "var(--text)" }}
                            >
                              {sender}
                            </span>
                            <span
                              className="text-[9px] font-medium"
                              style={{ color: "var(--text-3)" }}
                            >
                              {fmtTime(msg.created_at)}
                            </span>
                          </div>
                          <div
                            className="p-4 text-xs leading-relaxed"
                            style={{
                              background: "var(--surface-2)",
                              color: "var(--text-2)",
                              borderRadius: "0 16px 16px 16px",
                              border: "1px solid var(--border)",
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
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Input area — animated on project switch (Lumina style) */}
        <div className="flex-shrink-0 p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedId}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="space-y-4 rounded-3xl p-5"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
              }}
            >
              {/* Text input */}
              <input
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: "var(--text)" }}
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

              {/* Actions row: paperclip left, send right */}
              <div className="flex items-center justify-between pt-1">
                <button
                  className="transition-opacity hover:opacity-60"
                  style={{ color: "var(--text-3)" }}
                  aria-label="Anexar ficheiro"
                >
                  <Paperclip size={20} />
                </button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => void handleSend()}
                  disabled={!conversationId || !msgText.trim() || sending}
                  className="rounded-xl px-7 py-2.5 text-xs font-bold text-white shadow-lg disabled:opacity-40"
                  style={{
                    background: BLUE,
                    boxShadow: `0 4px 12px rgba(47,107,255,0.35)`,
                  }}
                >
                  Send
                </motion.button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </aside>
    </div>
  );
}
