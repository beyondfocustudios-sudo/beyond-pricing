"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Search, Send } from "lucide-react";
import { getConversations, getMessages, sendConversationMessage, type PortalConversation, type PortalMessage } from "@/lib/portal-data";

export default function PortalInboxPage() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const requestedProjectId = searchParams.get("project") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<PortalConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await getConversations();
        if (cancelled) return;
        setConversations(list);
        const picked = requestedProjectId
          ? list.find((conversation) => conversation.project_id === requestedProjectId)?.id ?? list[0]?.id ?? null
          : list[0]?.id ?? null;
        setSelectedConversationId(picked);
      } catch {
        if (!cancelled) setError("Falha ao carregar inbox.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [requestedProjectId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    let cancelled = false;

    const load = async () => {
      const list = await getMessages(selectedConversationId);
      if (!cancelled) setMessages(list);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedConversationId]);

  const filteredConversations = useMemo(() => {
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      const haystack = `${conversation.project_name ?? ""} ${conversation.last_message ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [conversations, query]);

  const filteredMessages = useMemo(() => {
    if (!query) return messages;
    return messages.filter((message) => message.body.toLowerCase().includes(query));
  }, [messages, query]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;

  const handleSend = async () => {
    if (!selectedConversationId || !messageInput.trim() || sending) return;
    setSending(true);
    const ok = await sendConversationMessage(selectedConversationId, messageInput.trim());
    if (ok) {
      setMessageInput("");
      setMessages(await getMessages(selectedConversationId));
    }
    setSending(false);
  };

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
    <div className="grid min-w-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_280px]">
      <section className="card min-h-[65vh] p-4 lg:h-[calc(100dvh-180px)] lg:overflow-y-auto">
        <h1 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Conversas</h1>
        <label className="table-search-pill mt-3 mb-3">
          <Search className="h-3.5 w-3.5" />
          <input readOnly value={query} placeholder="Usa a pesquisa no topo" />
        </label>

        <div className="space-y-2">
          {filteredConversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setSelectedConversationId(conversation.id)}
              className="card card-hover w-full p-3 text-left"
              style={{
                borderColor: selectedConversationId === conversation.id ? "rgba(26,143,163,0.35)" : "var(--border)",
                background: selectedConversationId === conversation.id ? "rgba(26,143,163,0.08)" : "var(--surface)",
              }}
            >
              <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{conversation.project_name ?? "Projeto"}</p>
              <p className="truncate text-xs" style={{ color: "var(--text-3)" }}>{conversation.last_message ?? "Sem mensagens"}</p>
            </button>
          ))}

          {filteredConversations.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
              Sem conversas para este filtro.
            </p>
          ) : null}
        </div>
      </section>

      <section className="card min-w-0 min-h-[65vh] p-4 lg:h-[calc(100dvh-180px)] lg:overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b pb-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{selectedConversation?.project_name ?? "Inbox"}</p>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-3 pr-1">
            {filteredMessages.map((message) => (
              <article key={message.id} className="rounded-2xl px-3 py-2" style={{
                background: message.sender_type === "client" ? "var(--surface-2)" : "rgba(26,143,163,0.14)",
              }}>
                <p className="text-sm" style={{ color: "var(--text)" }}>{message.body}</p>
                <p className="mt-1 text-[10px]" style={{ color: "var(--text-3)" }}>{new Date(message.created_at).toLocaleString("pt-PT")}</p>
              </article>
            ))}
            {filteredMessages.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                Sem mensagens nesta conversa.
              </p>
            ) : null}
          </div>

          <div className="mt-2 flex items-end gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <textarea
              className="input min-h-[72px] flex-1"
              placeholder="Escrever mensagem"
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
            />
            <button className="btn btn-primary btn-sm" onClick={() => void handleSend()} disabled={sending || !messageInput.trim()}>
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <aside className="card p-5">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Contexto</h2>
        {selectedConversation ? (
          <div className="mt-3 space-y-2 text-xs" style={{ color: "var(--text-2)" }}>
            <p><strong style={{ color: "var(--text)" }}>Projeto:</strong> {selectedConversation.project_name ?? "—"}</p>
            <p><strong style={{ color: "var(--text)" }}>Não lidas:</strong> {selectedConversation.unread_count}</p>
            <p><strong style={{ color: "var(--text)" }}>Atualizado:</strong> {new Date(selectedConversation.updated_at).toLocaleString("pt-PT")}</p>
          </div>
        ) : (
          <p className="mt-3 text-xs" style={{ color: "var(--text-3)" }}>Seleciona uma conversa.</p>
        )}

        <div className="mt-4 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <p className="flex items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
            <MessageSquare className="h-3.5 w-3.5" /> Thread centralizada por projeto
          </p>
        </div>
      </aside>
    </div>
  );
}
