"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Search,
  Sun,
  Moon,
  ChevronDown,
  Check,
} from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";

type ActiveToggle = "ceo" | "team" | "clients";

interface TopbarProps {
  activeToggle?: ActiveToggle;
  /** Injected user name for avatar */
  userName?: string;
  /** Notification count */
  notificationCount?: number;
}

const TOGGLE_ITEMS: { id: ActiveToggle; label: string; href: string }[] = [
  { id: "ceo",     label: "CEO",     href: "/ceo" },
  { id: "team",    label: "Team",    href: "/empresa" },
  { id: "clients", label: "Clients", href: "/portal" },
];

export function Topbar({
  activeToggle = "ceo",
  userName = "CEO",
  notificationCount = 0,
}: TopbarProps) {
  const [isDark, setIsDark] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("bp_theme", next); } catch {}
    setIsDark(!isDark);
  }

  // Format date range "1–7 Mar, 2026"
  const dateLabel = (() => {
    const now = new Date();
    const day = now.getDate();
    const month = now.toLocaleDateString("en-GB", { month: "short" });
    const year = now.getFullYear();
    return `${day}–${day + 6} ${month}, ${year}`;
  })();

  return (
    <header
      className="flex h-14 items-center gap-4 border-b px-6"
      style={{
        background: "var(--surface, #fff)",
        borderColor: "var(--border, rgba(0,0,0,0.08))",
      }}
    >
      {/* Wordmark */}
      <Link
        href="/ceo"
        className="mr-2 flex-shrink-0 text-lg font-bold leading-none"
        style={{
          fontFamily: "var(--font-dm-serif, Georgia, serif)",
          color: "var(--bf-accent, #1B4965)",
        }}
      >
        Beyond Focus
      </Link>

      {/* Area toggle — pills */}
      <div
        className="flex items-center gap-0.5 rounded-xl p-0.5"
        style={{ background: "var(--bg, #F5F6FA)" }}
      >
        {TOGGLE_ITEMS.map((item) => {
          const active = item.id === activeToggle;
          return (
            <Link key={item.id} href={item.href}>
              <motion.span
                layout
                className="relative inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold transition-colors"
                style={{
                  color: active ? "#fff" : "var(--text-2, #64748B)",
                  background: active ? "#1B4965" : "transparent",
                }}
              >
                {item.label}
              </motion.span>
            </Link>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="relative">
        <AnimatePresence>
          {searchOpen ? (
            <motion.input
              key="search-input"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 200, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              autoFocus
              placeholder="Pesquisar..."
              onBlur={() => setSearchOpen(false)}
              className="rounded-xl border px-3 py-1.5 text-sm outline-none"
              style={{
                background: "var(--bg, #F5F6FA)",
                borderColor: "var(--border, rgba(0,0,0,0.1))",
                color: "var(--text, #1B4965)",
              }}
            />
          ) : (
            <motion.button
              key="search-btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setSearchOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-black/5"
              aria-label="Pesquisar"
            >
              <Search size={16} style={{ color: "var(--text-3, #94A3B8)" }} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Date */}
      <span
        className="hidden whitespace-nowrap text-xs font-medium lg:block"
        style={{ color: "var(--text-3, #94A3B8)" }}
      >
        {dateLabel}
      </span>

      {/* Notifications */}
      <button
        className="relative flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-black/5"
        aria-label="Notificações"
      >
        <Bell size={16} style={{ color: "var(--text-3, #94A3B8)" }} />
        {notificationCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {notificationCount > 9 ? "9+" : notificationCount}
          </span>
        )}
      </button>

      {/* Dark/light toggle */}
      <button
        onClick={toggleTheme}
        className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-black/5"
        aria-label={isDark ? "Modo claro" : "Modo escuro"}
      >
        {isDark ? (
          <Sun size={16} style={{ color: "var(--text-3, #94A3B8)" }} />
        ) : (
          <Moon size={16} style={{ color: "var(--text-3, #94A3B8)" }} />
        )}
      </button>

      {/* Avatar + dropdown */}
      <div className="relative">
        <button
          onClick={() => setAvatarOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl p-0.5 pr-2 transition-colors hover:bg-black/5"
        >
          <Avatar name={userName} size="sm" />
          <ChevronDown size={12} style={{ color: "var(--text-3, #94A3B8)" }} />
        </button>

        <AnimatePresence>
          {avatarOpen && (
            <motion.div
              key="dropdown"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-2xl border p-1 shadow-lg"
              style={{
                background: "var(--surface, #fff)",
                borderColor: "var(--border, rgba(0,0,0,0.08))",
              }}
            >
              <div className="px-3 py-2">
                <p className="text-sm font-semibold" style={{ color: "var(--text, #1B4965)" }}>
                  {userName}
                </p>
                <p className="text-xs" style={{ color: "var(--text-3, #94A3B8)" }}>
                  Administrador
                </p>
              </div>
              <div className="my-1 border-t" style={{ borderColor: "var(--border, rgba(0,0,0,0.08))" }} />
              {[
                { label: "Definições", href: "/ceo/settings" },
                { label: "Sair", href: "/login" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setAvatarOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-black/5"
                  style={{ color: "var(--text, #1B4965)" }}
                >
                  {item.label}
                </Link>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
