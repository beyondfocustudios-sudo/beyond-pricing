"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Bell, X, MessageSquare, Package, Star, AlertCircle, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  project_id?: string;
  read_at?: string | null;
  created_at: string;
  link_url?: string;
}

const NOTIF_ICONS: Record<string, React.ElementType> = {
  new_message: MessageSquare,
  new_deliverable: Package,
  approval_requested: Star,
  request_created: AlertCircle,
  milestone_reached: CheckCheck,
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = await res.json() as Notification[];
      setNotifications(data);
      setUnread(data.filter(n => !n.read_at).length);
    } catch {
      // Network error — silently ignore, keep existing notifications
    }
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      channel = supabase
        .channel("notifications-bell")
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        }, () => void loadNotifications())
        .subscribe();
    }).catch(() => {
      // Auth check failed — skip realtime subscription
    });
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [loadNotifications, supabase]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead" }),
      });
      void loadNotifications();
    } catch {
      // Silently fail — next load will sync state
    }
  };

  const markRead = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markRead", id }),
      });
      void loadNotifications();
    } catch {
      // Silently fail
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors"
        style={{
          borderColor: "var(--border-soft)",
          background: "color-mix(in srgb, var(--surface) 84%, transparent)",
          color: "var(--text-2)",
        }}
        aria-label="Notificações"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 min-w-[16px] h-4 rounded-full bg-rose-500 px-0.5 text-[10px] font-bold text-white flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 flex max-h-[480px] w-80 flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md"
          style={{
            borderColor: "var(--border-soft)",
            background: "color-mix(in srgb, var(--surface) 92%, transparent)",
          }}
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border-soft)" }}>
            <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Notificações</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs transition-colors" style={{ color: "var(--text-3)" }}>
                  Ler tudo
                </button>
              )}
              <button onClick={() => setOpen(false)} className="transition-colors" style={{ color: "var(--text-3)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="py-10 text-center" style={{ color: "var(--text-3)" }}>
                <Bell className="mx-auto mb-2 h-6 w-6 opacity-60" />
                <p className="text-xs">Sem notificações</p>
              </div>
            ) : (
              notifications.map(n => {
                const Icon = NOTIF_ICONS[n.type] ?? Bell;
                const isUnread = !n.read_at;
                const content = (
                  <div
                    onClick={() => isUnread && markRead(n.id)}
                    className="flex cursor-pointer gap-3 border-b px-4 py-3 transition-colors last:border-0"
                    style={{
                      borderColor: "var(--border-soft)",
                      background: isUnread ? "color-mix(in srgb, var(--accent-primary) 12%, transparent)" : "transparent",
                    }}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: isUnread
                          ? "color-mix(in srgb, var(--accent-primary) 22%, transparent)"
                          : "color-mix(in srgb, var(--surface-2) 92%, transparent)",
                        color: isUnread ? "var(--accent-primary)" : "var(--text-3)",
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="mt-0.5 line-clamp-1 text-xs font-medium" style={{ color: isUnread ? "var(--text)" : "var(--text-2)" }}>
                        {n.title}
                      </p>
                      {n.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: "var(--text-3)" }}>
                          {n.body}
                        </p>
                      ) : null}
                    </div>
                    <span className="mt-0.5 shrink-0 text-[10px]" style={{ color: "var(--text-3)" }}>
                      {formatTime(n.created_at)}
                    </span>
                  </div>
                );
                return n.link_url ? (
                  <Link key={n.id} href={n.link_url} onClick={() => { void markRead(n.id); setOpen(false); }}>
                    {content}
                  </Link>
                ) : <div key={n.id}>{content}</div>;
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
