"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Send, Sparkles, ArrowLeft, Circle, Plus, X, ChevronDown } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { useToast } from "@/components/Toast";

interface Message {
  id: string;
  body: string;
  from: "team" | "client";
  created_at: string;
  read: boolean;
}

interface Conversation {
  id: string;
  project_name?: string;
  client_name?: string;
  last_message?: string;
  unread_count: number;
  updated_at: string;
  messages?: Message[];
}

interface Project {
  id: string;
  project_name: string;
  client_name: string;
  client_id?: string | null;
}

function InboxContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const selectedId = searchParams.get("id");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New conversation modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [newProjectId, setNewProjectId] = useState("");
  const [creatingConv, setCreatingConv] = useState(false);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      if (res.ok) {
        const data = await res.json() as { conversations: Conversation[] };
        setConversations(data.conversations ?? []);
      } else {
        const msg = "Erro ao carregar conversas";
        setLoadError(msg);
        toast.error(msg);
      }
    } catch {
      const msg = "Sem ligação — não foi possível carregar conversas";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const openConversation = useCallback(async (conv: Conversation) => {
    router.push(`/app/inbox?id=${conv.id}`, { scroll: false });
    setLoadingConv(true);
    try {
      const res = await fetch(`/api/conversations/${conv.id}`);
      if (res.ok) {
        const data = await res.json() as Conversation;
        setActiveConv(data);
        await fetch(`/api/conversations/${conv.id}/read`, { method: "POST" });
        setConversations((prev) => prev.map((c) => c.id === conv.id ? { ...c, unread_count: 0 } : c));
      } else {
        toast.error("Erro ao abrir conversa");
      }
    } catch {
      toast.error("Sem ligação");
    } finally {
      setLoadingConv(false);
    }
  }, [router, toast]);

  useEffect(() => {
    if (selectedId && conversations.length > 0 && !activeConv) {
      const conv = conversations.find((c) => c.id === selectedId);
      if (conv) openConversation(conv);
    }
  }, [selectedId, conversations, activeConv, openConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages]);

  const sendMessage = async () => {
    if (!input.trim() || !activeConv) return;
    setSending(true);
    const body = input;
    setInput("");
    try {
      const res = await fetch(`/api/conversations/${activeConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, from: "team" }),
      });
      if (res.ok) {
        const msg = await res.json() as Message;
        setActiveConv((prev) => prev ? { ...prev, messages: [...(prev.messages ?? []), msg] } : prev);
      } else {
        toast.error("Erro ao enviar mensagem");
        setInput(body); // restore
      }
    } catch {
      toast.error("Sem ligação");
      setInput(body);
    } finally {
      setSending(false);
    }
  };

  const suggestReply = async () => {
    if (!activeConv) return;
    setSuggesting(true);
    try {
      const res = await fetch(`/api/conversations/${activeConv.id}/suggest`, { method: "POST" });
      if (res.ok) {
        const data = await res.json() as { suggestion: string };
        if (data.suggestion) setInput(data.suggestion);
        else toast.info("Sugestão IA ainda não disponível");
      }
    } finally {
      setSuggesting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
    } catch { return ""; }
  };

  const goBack = () => {
    setActiveConv(null);
    router.push("/app/inbox", { scroll: false });
  };

  // ── New conversation ─────────────────────────────────────
  const openNewModal = async () => {
    setShowNewModal(true);
    setNewProjectId("");
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json() as { projects: Project[] };
        // Only projects that have a client
        setProjects((data.projects ?? []).filter((p) => p.client_id));
      } else {
        // Fallback: load from supabase directly via API
        setProjects([]);
      }
    } catch {
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  const createConversation = async () => {
    if (!newProjectId) return;
    setCreatingConv(true);
    try {
      const res = await fetch(`/api/conversations?projectId=${newProjectId}`);
      if (res.ok) {
        const data = await res.json() as { conversation: { id: string } };
        setShowNewModal(false);
        await fetchConversations();
        // Open the conversation
        const conv: Conversation = {
          id: data.conversation.id,
          unread_count: 0,
          updated_at: new Date().toISOString(),
        };
        openConversation(conv);
        toast.success("Conversa criada");
      } else {
        const err = await res.json() as { error?: string };
        toast.error(err.error ?? "Erro ao criar conversa");
      }
    } catch {
      toast.error("Sem ligação");
    } finally {
      setCreatingConv(false);
    }
  };

  return (
    <div className="h-[calc(100dvh-8rem)] flex gap-4 max-w-5xl mx-auto">
      {/* Conversation list */}
      <div className={`flex flex-col w-full md:w-80 shrink-0 ${activeConv ? "hidden md:flex" : "flex"}`}>
        <div className="flex items-center gap-3 mb-4">
          <MessageSquare className="h-5 w-5" style={{ color: "var(--accent)" }} />
          <h1 className="text-lg font-bold flex-1" style={{ color: "var(--text)" }}>Inbox</h1>
          <button
            onClick={openNewModal}
            className="btn btn-primary btn-sm"
            title="Nova conversa"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="card-glass rounded-xl h-16 animate-pulse" style={{ background: "var(--surface)" }} />
            ))
          ) : loadError ? (
            <div className="card-glass rounded-xl p-6 text-center space-y-3">
              <p style={{ color: "var(--text-2)" }}>{loadError}</p>
              <button onClick={fetchConversations} className="btn btn-secondary btn-sm mx-auto">
                Tentar novamente
              </button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="card-glass rounded-xl p-8 text-center space-y-3">
              <MessageSquare className="h-8 w-8 mx-auto" style={{ color: "var(--text-3)" }} />
              <p style={{ color: "var(--text-2)" }}>Sem conversas</p>
              <button onClick={openNewModal} className="btn btn-primary btn-sm mx-auto">
                <Plus className="h-4 w-4" />
                Iniciar conversa
              </button>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                className={`w-full text-left card-glass rounded-xl p-3 space-y-1 transition-all ${activeConv?.id === conv.id ? "ring-1" : ""}`}
                onClick={() => openConversation(conv)}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                    {conv.client_name ?? "Cliente"}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {conv.unread_count > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "var(--accent)", color: "white" }}>
                        {conv.unread_count}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>{formatTime(conv.updated_at)}</span>
                  </div>
                </div>
                {conv.project_name && <p className="text-xs" style={{ color: "var(--accent)" }}>{conv.project_name}</p>}
                {conv.last_message && <p className="text-xs truncate" style={{ color: "var(--text-3)" }}>{conv.last_message}</p>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversation detail */}
      {activeConv ? (
        <div className="flex flex-col flex-1 min-w-0 card-glass rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <button className="btn btn-ghost btn-icon-sm md:hidden" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-semibold" style={{ color: "var(--text)" }}>{activeConv.client_name ?? "Cliente"}</p>
              {activeConv.project_name && <p className="text-xs" style={{ color: "var(--accent)" }}>{activeConv.project_name}</p>}
            </div>
            <div className="flex items-center gap-1">
              <Circle className="h-2 w-2 fill-current" style={{ color: "#22c55e" }} />
              <span className="text-xs" style={{ color: "var(--text-3)" }}>Online</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loadingConv ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin h-6 w-6 border-2 rounded-full" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
              </div>
            ) : (activeConv.messages ?? []).length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem mensagens ainda</p>
              </div>
            ) : (
              (activeConv.messages ?? []).map((msg) => (
                <div key={msg.id} className={`flex ${msg.from === "team" ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[70%] rounded-2xl px-4 py-2.5 text-sm"
                    style={
                      msg.from === "team"
                        ? { background: "var(--accent)", color: "white", borderBottomRightRadius: "4px" }
                        : { background: "var(--surface-2)", color: "var(--text)", borderBottomLeftRadius: "4px" }
                    }
                  >
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p className="text-xs mt-1 opacity-70">{formatTime(msg.created_at)}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex gap-2 items-end">
              <textarea
                className="input flex-1 min-h-[44px] max-h-32 resize-y text-sm"
                placeholder="Escreve uma mensagem… (Enter para enviar)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button className="btn btn-primary btn-icon-sm shrink-0" onClick={sendMessage} disabled={sending || !input.trim()}>
                <Send className="h-4 w-4" />
              </button>
            </div>
            <button className="btn btn-ghost btn-sm text-xs" onClick={suggestReply} disabled={suggesting}>
              <Sparkles className="h-3.5 w-3.5" />
              {suggesting ? "A gerar…" : "Sugerir resposta"}
            </button>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center card-glass rounded-xl">
          <div className="text-center space-y-3">
            <MessageSquare className="h-10 w-10 mx-auto" style={{ color: "var(--text-3)" }} />
            <p style={{ color: "var(--text-2)" }}>Seleciona uma conversa</p>
            <button onClick={openNewModal} className="btn btn-primary btn-sm mx-auto">
              <Plus className="h-4 w-4" />
              Nova conversa
            </button>
          </div>
        </div>
      )}

      {/* ── New Conversation Modal ── */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewModal(false); }}
        >
          <div className="card rounded-2xl w-full max-w-sm space-y-4" style={{ background: "var(--surface)" }}>
            <div className="flex items-center justify-between">
              <p className="font-semibold" style={{ color: "var(--text)" }}>Nova Conversa</p>
              <button className="btn btn-ghost btn-icon-sm" onClick={() => setShowNewModal(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="label">Projeto</label>
              {loadingProjects ? (
                <div className="input flex items-center gap-2" style={{ color: "var(--text-3)" }}>
                  <div className="animate-spin h-4 w-4 border-2 rounded-full" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
                  A carregar projetos…
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={newProjectId}
                    onChange={(e) => setNewProjectId(e.target.value)}
                    className="input w-full appearance-none pr-8"
                  >
                    <option value="">Selecionar projeto com cliente…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.project_name}{p.client_name ? ` — ${p.client_name}` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "var(--text-3)" }} />
                </div>
              )}
              {!loadingProjects && projects.length === 0 && (
                <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                  Nenhum projeto com cliente associado. Vai a Projetos → Brief para associar um cliente.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button className="btn btn-secondary flex-1" onClick={() => setShowNewModal(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary flex-1"
                disabled={!newProjectId || creatingConv}
                onClick={createConversation}
              >
                {creatingConv ? "A criar…" : "Criar conversa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 rounded-full" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} /></div>}>
      <InboxContent />
    </Suspense>
  );
}
