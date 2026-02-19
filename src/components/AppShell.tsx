"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Calculator,
  CheckSquare,
  FileText,
  Settings,
  LogOut,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  {
    href: "/app",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    description: "Visão geral",
  },
  {
    href: "/app/projects",
    label: "Projetos",
    icon: Calculator,
    exact: false,
    description: "Orçamentos",
  },
  {
    href: "/app/checklists",
    label: "Checklists",
    icon: CheckSquare,
    exact: false,
    description: "Produção",
  },
  {
    href: "/app/templates",
    label: "Templates",
    icon: FileText,
    exact: false,
    description: "Reutilizar",
  },
  {
    href: "/app/preferences",
    label: "Preferências",
    icon: Settings,
    exact: false,
    description: "Configurar",
  },
];

function isActive(href: string, pathname: string, exact: boolean) {
  if (exact) return pathname === href;
  return pathname.startsWith(href);
}

export function AppShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const userInitial = userEmail?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="flex min-h-dvh" style={{ background: "var(--bg)" }}>
      {/* ── Desktop Sidebar ─────────────────────────── */}
      <aside
        className="hidden md:flex w-64 flex-col"
        style={{
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          height: "100dvh",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background: "var(--accent)",
              boxShadow: "0 0 16px var(--accent-glow)",
            }}
          >
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
              Beyond Pricing
            </p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Production Studio
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="section-title px-2 mb-3">Menu</p>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href, pathname, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active ? "active" : ""}`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {active && (
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: "var(--accent)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div
          className="px-3 py-4 space-y-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3 px-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-xs font-medium"
                style={{ color: "var(--text)" }}
              >
                {userEmail}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="glow-dot" />
                <span className="text-xs" style={{ color: "var(--text-3)" }}>
                  Online
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="btn btn-ghost btn-sm w-full justify-start"
            style={{ color: "var(--text-3)" }}
          >
            <LogOut className="h-3.5 w-3.5" />
            {signingOut ? "A sair…" : "Terminar sessão"}
          </button>
        </div>
      </aside>

      {/* ── Mobile Layout ───────────────────────────── */}
      <div className="flex flex-1 flex-col md:hidden min-w-0">
        {/* Mobile top bar */}
        <header
          className="flex h-14 items-center justify-between px-4"
          style={{
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            position: "sticky",
            top: 0,
            zIndex: 40,
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: "var(--accent)", boxShadow: "0 0 12px var(--accent-glow)" }}
            >
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <span
              className="text-sm font-bold"
              style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
            >
              Beyond Pricing
            </span>
          </div>

          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="btn btn-ghost btn-icon-sm"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto pb-20">
          <div className="px-4 py-5 md:px-8 md:py-8">{children}</div>
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="fixed bottom-0 left-0 right-0 flex items-center"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "var(--glass-blur)",
            WebkitBackdropFilter: "var(--glass-blur)",
            borderTop: "1px solid var(--border-2)",
            paddingBottom: "env(safe-area-inset-bottom)",
            zIndex: 40,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href, pathname, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex flex-1 flex-col items-center justify-center py-3 gap-1 transition-all"
                style={{
                  color: active ? "var(--accent-2)" : "var(--text-3)",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {active && (
                  <motion.div
                    layoutId="mobile-nav-indicator"
                    className="absolute inset-x-1 top-0 h-0.5 rounded-full"
                    style={{ background: "var(--accent)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon className="h-5 w-5" />
                <span className="text-xs font-medium" style={{ fontSize: "0.65rem" }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Desktop main content ─────────────────────── */}
      <main className="hidden md:flex flex-1 flex-col min-w-0 overflow-auto">
        <div className="flex-1 px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

/* Animated page wrapper para usar dentro das páginas */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
