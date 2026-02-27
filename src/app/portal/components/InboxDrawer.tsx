"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { useInboxDrawer } from "@/app/portal/context/InboxDrawerProvider";
import { getConversationForProject, getMessages, sendConversationMessage, type PortalMessage } from "@/lib/portal-data";

export function InboxDrawer() {
  const { isOpen, projectId, closeDrawer } = useInboxDrawer();
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !projectId) return;

    const loadConversation = async () => {
      setLoading(true);
      try {
        const convId = await getConversationForProject(projectId);
        if (convId) {
          setConversationId(convId);
          const msgs = await getMessages(convId);
          setMessages(msgs);
        }
      } finally {
        setLoading(false);
      }
    };

    void loadConversation();
  }, [isOpen, projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!conversationId || !messageInput.trim() || sending) return;

    setSending(true);
    try {
      const ok = await sendConversationMessage(conversationId, messageInput.trim());
      if (ok) {
        setMessageInput("");
        const updatedMessages = await getMessages(conversationId);
        setMessages(updatedMessages);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 transition-opacity duration-300"
          onClick={closeDrawer}
          style={{ opacity: isOpen ? 1 : 0 }}
        />
      )}

      {/* Drawer */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-full sm:w-96 bg-white dark:bg-slate-900 border-l dark:border-slate-700 shadow-xl transition-transform duration-300"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          borderLeftColor: "var(--border)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4 dark:border-slate-700" style={{ borderBottomColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            Mensagens
          </h2>
          <button
            onClick={closeDrawer}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" style={{ color: "var(--text-2)" }} />
          </button>
        </div>

        {/* Messages List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--text-2)" }} />
            </div>
          ) : messages.length > 0 ? (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: message.sender_type === "client" ? "var(--surface-2)" : "rgba(26, 143, 163, 0.14)",
                    color: "var(--text)",
                  }}
                >
                  <p>{message.body}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                    {new Date(message.created_at).toLocaleTimeString("pt-PT")}
                  </p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          ) : (
            <p className="text-xs text-center mt-4" style={{ color: "var(--text-3)" }}>
              Sem mensagens nesta conversa
            </p>
          )}
        </div>

        {/* Input */}
        {conversationId && (
          <div className="border-t p-4 flex gap-2 dark:border-slate-700" style={{ borderTopColor: "var(--border)" }}>
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
              placeholder="Escrever mensagem..."
              className="input flex-1 text-sm"
              disabled={sending}
            />
            <button
              onClick={() => void handleSendMessage()}
              disabled={!messageInput.trim() || sending}
              className="btn btn-primary btn-sm"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
