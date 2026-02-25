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
        className="relative p-2 rounded-xl hover:bg-white/10 transition-colors"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5 text-white/70" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-rose-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[480px] rounded-2xl bg-gray-900 border border-white/10 shadow-2xl overflow-hidden flex flex-col z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
            <span className="text-sm font-semibold text-white">Notificações</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-white/40 hover:text-white/70 transition-colors">
                  Ler tudo
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="text-center py-10 text-white/30">
                <Bell className="w-6 h-6 mx-auto mb-2 opacity-40" />
                <p className="text-xs">Sem notificações</p>
              </div>
            ) : (
              notifications.map(n => {
                const Icon = NOTIF_ICONS[n.type] ?? Bell;
                const isUnread = !n.read_at;
                const content = (
                  <div
                    onClick={() => isUnread && markRead(n.id)}
                    className={`flex gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5 last:border-0 ${isUnread ? "bg-blue-500/5" : ""}`}
                  >
                    <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${isUnread ? "bg-blue-500/20" : "bg-white/8"}`}>
                      <Icon className={`w-4 h-4 ${isUnread ? "text-blue-400" : "text-white/40"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium line-clamp-1 ${isUnread ? "text-white" : "text-white/60"}`}>{n.title}</p>
                      {n.body && <p className="text-xs text-white/40 line-clamp-2 mt-0.5">{n.body}</p>}
                    </div>
                    <span className="text-[10px] text-white/30 shrink-0 mt-0.5">{formatTime(n.created_at)}</span>
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
