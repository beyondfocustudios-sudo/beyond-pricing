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
  TrendingUp,
  Building2,
  MessageSquare,
  BookOpen,
  ListTodo,
  Users2,
  Truck,
  Cloud,
  Bell,
  ClipboardList,
  Briefcase,
  User,
  Sun,
  Moon,
} from "lucide-react";
import { useState, useEffect } from "react";
import NotificationBell from "@/components/NotificationBell";
import { useTheme } from "@/components/ThemeProvider";

type ViewMode = "company" | "ceo";

// CEO mode: high-level items only
const CEO_HREFS = new Set(["/app", "/app/inbox", "/app/journal", "/app/crm", "/app/insights"]);

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
    href: "/app/insights",
    label: "Insights",
    icon: TrendingUp,
    exact: false,
    description: "Análise",
  },
  {
    href: "/app/clients",
    label: "Clientes",
    icon: Building2,
    exact: false,
    description: "Portal",
  },
  {
    href: "/app/inbox",
    label: "Inbox",
    icon: MessageSquare,
    exact: false,
    description: "Mensagens",
  },
  {
    href: "/app/journal",
    label: "Journal",
    icon: BookOpen,
    exact: false,
    description: "Notas",
  },
  {
    href: "/app/tasks",
    label: "Tarefas",
    icon: ListTodo,
    exact: false,
    description: "Kanban",
  },
  {
    href: "/app/crm",
    label: "CRM",
    icon: Users2,
    exact: false,
    description: "Contactos",
  },
  {
    href: "/app/logistics",
    label: "Logística",
    icon: Truck,
    exact: false,
    description: "Rotas",
  },
  {
    href: "/app/callsheets",
    label: "Call Sheets",
    icon: ClipboardList,
    exact: false,
    description: "Fichas de rodagem",
  },
  {
    href: "/app/weather",
    label: "Tempo",
    icon: Cloud,
    exact: false,
    description: "Meteorologia",
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
  const [viewMode, setViewMode] = useState<ViewMode>("company");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" ? localStorage.getItem("bp_view_mode") : null) as ViewMode | null;
    if (saved === "ceo" || saved === "company") setViewMode(saved);
  }, []);

  const toggleMode = () => {
    const next: ViewMode = viewMode === "company" ? "ceo" : "company";
    setViewMode(next);
    if (typeof localStorage !== "undefined") localStorage.setItem("bp_view_mode", next);
  };

  const visibleNavItems = viewMode === "ceo"
    ? NAV_ITEMS.filter((i) => CEO_HREFS.has(i.href))
    : NAV_ITEMS;

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
        className="hidden md:flex flex-col transition-all duration-200"
        style={{
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          height: "100dvh",
          width: sidebarExpanded ? "16rem" : "4rem",
          zIndex: 30,
          overflow: "hidden",
        }}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-3 py-5 shrink-0"
          style={{ borderBottom: "1px solid var(--border)", minHeight: "4.5rem" }}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: "var(--accent)",
              boxShadow: "0 0 16px var(--accent-glow)",
            }}
          >
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div
            className="overflow-hidden whitespace-nowrap transition-all duration-200"
            style={{ opacity: sidebarExpanded ? 1 : 0, width: sidebarExpanded ? "auto" : 0 }}
          >
            <p className="text-sm font-bold" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
              Beyond Pricing
            </p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Production Studio
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {visibleNavItems.map((item) => {
            const active = isActive(item.href, pathname, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${active ? "active" : ""}`}
                title={!sidebarExpanded ? item.label : undefined}
                style={{ justifyContent: sidebarExpanded ? undefined : "center", gap: sidebarExpanded ? undefined : 0, paddingLeft: sidebarExpanded ? undefined : "0.625rem", paddingRight: sidebarExpanded ? undefined : "0.625rem" }}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span
                  className="overflow-hidden whitespace-nowrap transition-all duration-150 flex-1"
                  style={{ opacity: sidebarExpanded ? 1 : 0, width: sidebarExpanded ? "auto" : 0, maxWidth: sidebarExpanded ? "10rem" : 0 }}
                >
                  {item.label}
                </span>
                {active && sidebarExpanded && (
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
          className="px-2 py-4 space-y-1 shrink-0"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {sidebarExpanded && (
            <div className="flex items-center gap-3 px-2 mb-2">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                {userInitial}
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate text-xs font-medium" style={{ color: "var(--text)" }}>
                  {userEmail}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="glow-dot" />
                  <span className="text-xs" style={{ color: "var(--text-3)" }}>Online</span>
                </div>
              </div>
              <NotificationBell />
            </div>
          )}
          {!sidebarExpanded && (
            <div className="flex justify-center py-1 mb-1">
              <NotificationBell />
            </div>
          )}
          <button
            onClick={toggleTheme}
            className="btn btn-ghost btn-sm w-full"
            style={{ color: "var(--text-3)", justifyContent: sidebarExpanded ? "flex-start" : "center", paddingLeft: sidebarExpanded ? undefined : "0.625rem", paddingRight: sidebarExpanded ? undefined : "0.625rem" }}
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5 shrink-0" /> : <Moon className="h-3.5 w-3.5 shrink-0" />}
            {sidebarExpanded && (
              <span className="overflow-hidden whitespace-nowrap">
                {theme === "dark" ? "Modo claro" : "Modo escuro"}
              </span>
            )}
          </button>
          <button
            onClick={toggleMode}
            className="btn btn-ghost btn-sm w-full"
            style={{ color: "var(--text-3)", justifyContent: sidebarExpanded ? "flex-start" : "center", paddingLeft: sidebarExpanded ? undefined : "0.625rem", paddingRight: sidebarExpanded ? undefined : "0.625rem" }}
            title={viewMode === "company" ? "Modo CEO" : "Modo Empresa"}
          >
            {viewMode === "company" ? <User className="h-3.5 w-3.5 shrink-0" /> : <Briefcase className="h-3.5 w-3.5 shrink-0" />}
            {sidebarExpanded && (
              <span className="overflow-hidden whitespace-nowrap">
                {viewMode === "company" ? "Modo CEO" : "Modo Empresa"}
              </span>
            )}
          </button>
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="btn btn-ghost btn-sm w-full"
            style={{ color: "var(--text-3)", justifyContent: sidebarExpanded ? "flex-start" : "center", paddingLeft: sidebarExpanded ? undefined : "0.625rem", paddingRight: sidebarExpanded ? undefined : "0.625rem" }}
            title="Terminar sessão"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {sidebarExpanded && (
              <span className="overflow-hidden whitespace-nowrap">
                {signingOut ? "A sair…" : "Terminar sessão"}
              </span>
            )}
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

          <div className="flex items-center gap-2">
            <NotificationBell />
            <button onClick={toggleTheme} className="btn btn-ghost btn-icon-sm" title={theme === "dark" ? "Modo claro" : "Modo escuro"}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={handleLogout}
              disabled={signingOut}
              className="btn btn-ghost btn-icon-sm"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
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
          {visibleNavItems.slice(0, 5).map((item) => {
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
