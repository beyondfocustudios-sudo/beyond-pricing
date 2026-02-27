"use client";

/**
 * ProjectInboxPanel
 * Slide-in right panel showing project-specific conversation + send input.
 * Reuses portal-data helpers: getConversationForProject, getMessages, sendConversationMessage.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MessageSquare, Send, X } from "lucide-react";
import { spring, variants } from "@/lib/motion";
import {
  getConversationForProject,
  getMessages,
  sendConversationMessage,
  type PortalMessage,
} from "@/lib/portal-data";

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export function ProjectInboxPanel({ projectId, projectName, onClose }: Props) {
  const reduced = useReducedMotion();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load conversation + messages when projectId changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setConversationId(null);

    const load = async () => {
      try {
        const convId = await getConversationForProject(projectId);
        if (cancelled) return;
        setConversationId(convId);
        if (convId) {
          const msgs = await getMessages(convId);
          if (!cancelled) setMessages(msgs);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!draft.trim() || !conversationId || sending) return;
    const text = draft.trim();
    setSending(true);
    setDraft("");
    const ok = await sendConversationMessage(conversationId, text);
    if (ok) {
      const msgs = await getMessages(conversationId);
      setMessages(msgs);
    } else {
      setDraft(text); // restore on failure
    }
    setSending(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <motion.aside
      className="flex flex-col overflow-hidden rounded-2xl border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        minHeight: 0,
      }}
      initial={reduced ? false : { x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reduced ? undefined : { x: 20, opacity: 0 }}
      transition={spring.ui}
    >
      {/* ── Header ── */}
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare
            className="h-4 w-4 shrink-0"
            style={{ color: "var(--accent-blue)" }}
          />
          <div className="min-w-0">
            <p
              className="text-xs font-semibold"
              style={{ color: "var(--text)" }}
            >
              Inbox
            </p>
            <p
              className="truncate text-[10px]"
              style={{ color: "var(--text-3)" }}
            >
              {projectName}
            </p>
          </div>
        </div>
        <button
          className="icon-btn shrink-0"
          onClick={onClose}
          aria-label="Fechar inbox"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Messages list ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 rounded-xl" />
            ))}
          </div>
        )}

        {!loading && !conversationId && (
          <div className="flex h-32 flex-col items-center justify-center gap-2">
            <MessageSquare
              className="h-8 w-8"
              style={{ color: "var(--text-3)" }}
            />
            <p
              className="text-center text-xs"
              style={{ color: "var(--text-3)" }}
            >
              Sem conversa para este projeto.
              <br />
              Contacta a equipa para iniciar.
            </p>
          </div>
        )}

        {!loading && conversationId && messages.length === 0 && (
          <p
            className="py-6 text-center text-xs"
            style={{ color: "var(--text-3)" }}
          >
            Nenhuma mensagem ainda. Inicia a conversa!
          </p>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isClient = msg.sender_type === "client";
            return (
              <motion.div
                key={msg.id}
                className={`mb-2 flex ${isClient ? "justify-end" : "justify-start"}`}
                variants={variants.itemEnter}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div
                  className="max-w-[82%] rounded-2xl px-3 py-2"
                  style={{
                    background: isClient
                      ? "var(--accent-blue)"
                      : "var(--surface-2)",
                    color: isClient ? "#fff" : "var(--text)",
                  }}
                >
                  <p className="text-sm leading-snug">{msg.body}</p>
                  <p
                    className="mt-0.5 text-[9px] opacity-60"
                    style={{
                      color: isClient ? "#fff" : "var(--text-3)",
                    }}
                  >
                    {new Date(msg.created_at).toLocaleString("pt-PT", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "short",
                    })}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* ── Send input ── */}
      {conversationId && (
        <div
          className="shrink-0 border-t px-3 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              className="min-h-[40px] max-h-[96px] flex-1 resize-none rounded-xl border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface-2)",
                color: "var(--text)",
                outline: "none",
              }}
              placeholder="Escreve uma mensagem…"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
            <button
              className="btn btn-primary btn-sm shrink-0"
              onClick={() => void handleSend()}
              disabled={!draft.trim() || sending}
              aria-label="Enviar mensagem"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </motion.aside>
  );
}
