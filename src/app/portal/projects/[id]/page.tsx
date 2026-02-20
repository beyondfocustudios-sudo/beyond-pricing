"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  ChevronLeft, MessageSquare, Package, CheckCircle2,
  Clock, AlertCircle, Send, PlusCircle, X,
  FileText, Image, Video, Download, Loader2,
  Bell, Star, Calendar, Flag, Paperclip,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface Milestone {
  id: string;
  title: string;
  phase: string;
  status: string;
  progress_percent: number;
  due_date?: string;
  completed_at?: string;
  description?: string;
}

interface Deliverable {
  id: string;
  title: string;
  file_type?: string;
  status?: string;
  dropbox_url?: string;
  created_at: string;
}

interface Message {
  id: string;
  sender_type: string;
  content: string;
  created_at: string;
  sender?: { email: string; raw_user_meta_data?: { full_name?: string } };
}

interface ClientRequest {
  id: string;
  title: string;
  description?: string;
  type: string;
  priority: string;
  status: string;
  deadline?: string;
  created_at: string;
}

type Tab = "overview" | "deliverables" | "approvals" | "messages";

const PHASE_LABELS: Record<string, string> = {
  pre_producao: "Pré-Produção",
  rodagem: "Rodagem",
  pos_producao: "Pós-Produção",
  entrega: "Entrega",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-400 bg-amber-400/10",
  in_progress: "text-blue-400 bg-blue-400/10",
  completed: "text-emerald-400 bg-emerald-400/10",
  delayed: "text-rose-400 bg-rose-400/10",
  open: "text-amber-400 bg-amber-400/10",
  in_review: "text-purple-400 bg-purple-400/10",
  resolved: "text-emerald-400 bg-emerald-400/10",
  closed: "text-white/40 bg-white/5",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-white/40",
  medium: "text-amber-400",
  high: "text-orange-400",
  urgent: "text-rose-400",
};

export default function PortalProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [project, setProject] = useState<{ id: string; name: string; status?: string; client_id?: string } | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgInput, setMsgInput] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [newReq, setNewReq] = useState({ title: "", description: "", type: "general", priority: "medium", deadline: "" });
  const [submittingReq, setSubmittingReq] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadProject = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name, status, client_id")
      .eq("id", id)
      .single();
    setProject(data);
  }, [id, supabase]);

  const loadMilestones = useCallback(async () => {
    const res = await fetch(`/api/portal/milestones?projectId=${id}`);
    if (res.ok) setMilestones(await res.json());
  }, [id]);

  const loadDeliverables = useCallback(async () => {
    const { data } = await supabase
      .from("deliverables")
      .select("id, title, file_type, status, dropbox_url, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false });
    setDeliverables(data ?? []);
  }, [id, supabase]);

  const loadMessages = useCallback(async () => {
    // Get or create conversation
    const res = await fetch(`/api/conversations?projectId=${id}`);
    if (!res.ok) return;
    const conv = await res.json();
    const cid = conv.id ?? conv[0]?.id;
    if (!cid) return;
    setConvId(cid);

    const msgRes = await fetch(`/api/messages?conversationId=${cid}&limit=50`);
    if (msgRes.ok) {
      const data = await msgRes.json();
      setMessages(data);
      // Mark as read
      await fetch(`/api/messages/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: cid }),
      });
    }
  }, [id]);

  const loadRequests = useCallback(async () => {
    const res = await fetch(`/api/portal/requests?projectId=${id}`);
    if (res.ok) setRequests(await res.json());
  }, [id]);

  const loadNotifications = useCallback(async () => {
    const res = await fetch("/api/notifications?unreadOnly=true");
    if (res.ok) {
      const data = await res.json();
      setUnreadCount(Array.isArray(data) ? data.length : 0);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([
        loadProject(),
        loadMilestones(),
        loadDeliverables(),
        loadMessages(),
        loadRequests(),
        loadNotifications(),
      ]);
      setLoading(false);
    };
    load();
  }, [loadProject, loadMilestones, loadDeliverables, loadMessages, loadRequests, loadNotifications]);

  // Real-time messages subscription
  useEffect(() => {
    if (!convId) return;
    const channel = supabase
      .channel(`conv-${convId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${convId}`,
      }, () => { loadMessages(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [convId, loadMessages, supabase]);

  const sendMessage = async () => {
    if (!msgInput.trim() || !convId || sendingMsg) return;
    setSendingMsg(true);
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: convId, content: msgInput.trim() }),
    });
    setMsgInput("");
    setSendingMsg(false);
    loadMessages();
  };

  const submitRequest = async () => {
    if (!newReq.title.trim() || submittingReq) return;
    setSubmittingReq(true);
    await fetch("/api/portal/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id, ...newReq }),
    });
    setSubmittingReq(false);
    setShowNewRequest(false);
    setNewReq({ title: "", description: "", type: "general", priority: "medium", deadline: "" });
    loadRequests();
  };

  const overallProgress = milestones.length
    ? Math.round(milestones.reduce((s, m) => s + (m.progress_percent ?? 0), 0) / milestones.length)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: FileText },
    { id: "deliverables", label: "Entregas", icon: Package, badge: deliverables.length },
    { id: "approvals", label: "Pedidos", icon: Star, badge: requests.filter(r => r.status === "open").length || undefined },
    { id: "messages", label: "Mensagens", icon: MessageSquare, badge: unreadCount || undefined },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-gray-950/90 backdrop-blur-xl px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button onClick={() => router.push("/portal")} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm">
            <ChevronLeft className="w-4 h-4" />
            Portal
          </button>
          <h1 className="text-base font-semibold truncate max-w-[200px]">{project?.name ?? "Projeto"}</h1>
          <div className="relative">
            <Bell className="w-5 h-5 text-white/60" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="sticky top-[57px] z-30 bg-gray-950/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-3xl mx-auto flex">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${tab === t.id ? "text-white" : "text-white/40 hover:text-white/70"}`}
            >
              <div className="relative">
                <t.icon className="w-4 h-4" />
                {t.badge != null && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-rose-500 rounded-full text-[9px] font-bold flex items-center justify-center">
                    {t.badge}
                  </span>
                )}
              </div>
              {t.label}
              {tab === t.id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-white rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Progress card */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-white/60">Progresso geral</span>
                <span className="text-2xl font-bold">{overallProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-700"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>

            {/* Milestones */}
            <div>
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Milestones</h2>
              {milestones.length === 0 ? (
                <p className="text-white/30 text-sm">Nenhum milestone definido.</p>
              ) : (
                <div className="space-y-3">
                  {milestones.map(m => (
                    <div key={m.id} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{m.title}</p>
                          <p className="text-xs text-white/40 mt-0.5">{PHASE_LABELS[m.phase] ?? m.phase}</p>
                          {m.description && <p className="text-xs text-white/50 mt-1 line-clamp-2">{m.description}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[m.status] ?? "text-white/60"}`}>
                            {m.status === "completed" ? "Concluído" : m.status === "in_progress" ? "Em curso" : m.status === "delayed" ? "Atrasado" : "Pendente"}
                          </span>
                          {m.due_date && (
                            <span className="flex items-center gap-1 text-xs text-white/40">
                              <Calendar className="w-3 h-3" />
                              {new Date(m.due_date).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            m.status === "completed" ? "bg-emerald-500" :
                            m.status === "delayed" ? "bg-rose-500" :
                            "bg-blue-500"
                          }`}
                          style={{ width: `${m.progress_percent ?? 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-white/30 mt-1">{m.progress_percent ?? 0}%</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Deliverables ── */}
        {tab === "deliverables" && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Entregas</h2>
            {deliverables.length === 0 ? (
              <div className="text-center py-12 text-white/30">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhuma entrega disponível ainda.</p>
              </div>
            ) : (
              deliverables.map(d => {
                const isVideo = d.file_type?.startsWith("video") || d.title.match(/\.(mp4|mov|avi)/i);
                const isImage = d.file_type?.startsWith("image") || d.title.match(/\.(jpg|jpeg|png|gif|webp)/i);
                const Icon = isVideo ? Video : isImage ? Image : FileText;
                return (
                  <div key={d.id} className="flex items-center gap-4 rounded-2xl bg-white/5 border border-white/10 p-4 hover:bg-white/8 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-white/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.title}</p>
                      <p className="text-xs text-white/40">{new Date(d.created_at).toLocaleDateString("pt-PT")}</p>
                    </div>
                    {d.dropbox_url && (
                      <a
                        href={d.dropbox_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <Download className="w-4 h-4 text-white/60" />
                      </a>
                    )}
                    {d.status && (
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status] ?? "text-white/40 bg-white/5"}`}>
                        {d.status}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Approvals / Requests ── */}
        {tab === "approvals" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Pedidos</h2>
              <button
                onClick={() => setShowNewRequest(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Novo pedido
              </button>
            </div>

            {/* New request form */}
            {showNewRequest && (
              <div className="rounded-2xl bg-white/8 border border-white/15 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Novo Pedido</span>
                  <button onClick={() => setShowNewRequest(false)} className="text-white/40 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <input
                  value={newReq.title}
                  onChange={e => setNewReq(r => ({ ...r, title: e.target.value }))}
                  placeholder="Título do pedido *"
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/25"
                />
                <textarea
                  value={newReq.description}
                  onChange={e => setNewReq(r => ({ ...r, description: e.target.value }))}
                  placeholder="Descrição (opcional)"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/25 resize-none"
                />
                <div className="flex gap-2">
                  <select
                    value={newReq.type}
                    onChange={e => setNewReq(r => ({ ...r, type: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none"
                  >
                    <option value="general">Geral</option>
                    <option value="revision">Revisão</option>
                    <option value="additional">Extra</option>
                    <option value="approval">Aprovação</option>
                  </select>
                  <select
                    value={newReq.priority}
                    onChange={e => setNewReq(r => ({ ...r, priority: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
                <input
                  type="date"
                  value={newReq.deadline}
                  onChange={e => setNewReq(r => ({ ...r, deadline: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none"
                />
                <button
                  onClick={submitRequest}
                  disabled={submittingReq || !newReq.title.trim()}
                  className="w-full py-2.5 rounded-xl bg-white text-gray-900 text-sm font-semibold disabled:opacity-50 hover:bg-white/90 transition-all"
                >
                  {submittingReq ? "A enviar…" : "Enviar pedido"}
                </button>
              </div>
            )}

            {requests.length === 0 ? (
              <div className="text-center py-12 text-white/30">
                <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum pedido ainda.</p>
              </div>
            ) : (
              requests.map(r => (
                <div key={r.id} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{r.title}</p>
                      {r.description && <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{r.description}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] ?? "text-white/40 bg-white/5"}`}>
                        {r.status === "open" ? "Aberto" : r.status === "in_review" ? "Em revisão" : r.status === "resolved" ? "Resolvido" : r.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/40">
                    <span className={`flex items-center gap-1 ${PRIORITY_COLORS[r.priority] ?? ""}`}>
                      <Flag className="w-3 h-3" />
                      {r.priority === "low" ? "Baixa" : r.priority === "medium" ? "Média" : r.priority === "high" ? "Alta" : "Urgente"}
                    </span>
                    {r.deadline && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(r.deadline).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                    <span>{new Date(r.created_at).toLocaleDateString("pt-PT")}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Messages ── */}
        {tab === "messages" && (
          <div className="flex flex-col gap-4">
            <div className="space-y-3 min-h-[300px] max-h-[60vh] overflow-y-auto">
              {messages.length === 0 ? (
                <div className="text-center py-12 text-white/30">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhuma mensagem ainda. Inicia a conversa!</p>
                </div>
              ) : (
                messages.map(m => {
                  const isClient = m.sender_type === "client";
                  return (
                    <div key={m.id} className={`flex ${isClient ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isClient ? "bg-white text-gray-900" : "bg-white/10 text-white"}`}>
                        <p className="text-sm leading-relaxed">{m.content}</p>
                        <p className={`text-[10px] mt-1 ${isClient ? "text-gray-500" : "text-white/40"}`}>
                          {new Date(m.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex gap-2 items-end sticky bottom-0 bg-gray-950 py-2">
              <textarea
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Escreve uma mensagem…"
                rows={2}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30 resize-none"
              />
              <button
                onClick={sendMessage}
                disabled={!msgInput.trim() || sendingMsg}
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-2xl bg-white text-gray-900 disabled:opacity-40 hover:bg-white/90 transition-all"
              >
                {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
