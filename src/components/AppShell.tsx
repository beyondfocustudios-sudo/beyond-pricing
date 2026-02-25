"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard,
  Calculator,
  Building2,
  CalendarDays,
  MessageSquare,
  TrendingUp,
  Settings,
  CheckSquare,
  FileText,
  BookOpen,
  ListTodo,
  Users2,
  ClipboardList,
  Activity,
  LifeBuoy,
  LogOut,
  Moon,
  Sun,
  Zap,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import NotificationBell from "@/components/NotificationBell";
import { useTheme } from "@/components/ThemeProvider";
import { PillTabs, SuperShell } from "@/components/dashboard/super-dashboard";
import { buttonMotionProps, transitions, variants } from "@/lib/motion";
import HQAssistantWidget from "@/components/HQAssistantWidget";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/projects", label: "Projects", icon: Calculator },
  { href: "/app/clients", label: "Clients", icon: Building2 },
  { href: "/app/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/app/insights", label: "Insights", icon: TrendingUp },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

const SECONDARY_NAV: NavItem[] = [
  { href: "/app/checklists", label: "Checklists", icon: CheckSquare },
  { href: "/app/templates", label: "Templates", icon: FileText },
  { href: "/app/journal", label: "Journal", icon: BookOpen },
  { href: "/app/tasks", label: "Tasks", icon: ListTodo },
  { href: "/app/crm", label: "CRM", icon: Users2 },
  { href: "/app/callsheets", label: "Call Sheets", icon: ClipboardList },
  { href: "/app/diagnostics", label: "Diagnostics", icon: Activity },
  { href: "/app/support", label: "Support", icon: LifeBuoy },
];

const CEO_RAIL: NavItem[] = [
  { href: "/app/tasks", label: "My Tasks", icon: ListTodo },
  { href: "/app/callsheets", label: "Calendar", icon: CalendarDays },
  { href: "/app/inbox", label: "Inbox", icon: MessageSquare },
];

const MOBILE_NAV: NavItem[] = [
  { href: "/app/dashboard", label: "Dash", icon: LayoutDashboard },
  { href: "/app/projects", label: "Projects", icon: Calculator },
  { href: "/app/clients", label: "Clients", icon: Building2 },
  { href: "/app/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function navIsActive(pathname: string, href: string) {
  if (pathname === "/app/preferences") {
    pathname = "/app/settings";
  }
  if (href === "/app/dashboard") return pathname === "/app" || pathname === "/app/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolvePrimaryActive(pathname: string) {
  const found = PRIMARY_NAV.find((tab) => navIsActive(pathname, tab.href));
  return found?.href ?? "/app/dashboard";
}

function railIsActive(pathname: string, href: string) {
  if (href === "/app/dashboard") return pathname === "/app" || pathname === "/app/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  userEmail,
}: {
  children: ReactNode;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const { theme, toggleTheme, dashboardMode } = useTheme();
  const reduceMotion = useReducedMotion();
  const activePrimary = useMemo(() => resolvePrimaryActive(pathname), [pathname]);
  const isCeoMode = dashboardMode === "ceo";
  const railItems = isCeoMode ? CEO_RAIL : SECONDARY_NAV;

  const handleLogout = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const userInitial = (userEmail?.[0] ?? "U").toUpperCase();

  return (
    <div
      className="super-theme super-shell-bg h-dvh min-h-dvh overflow-x-clip"
      style={{ padding: "clamp(16px, 2.5vw, 40px)" }}
    >
      <SuperShell className="mx-auto flex h-full min-h-full w-full max-w-[1440px] flex-col overflow-x-clip">
        <header className="super-topbar">
          <Link href="/app/dashboard" className="inline-flex items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: "var(--accent-blue)", color: "#fff" }}
            >
              <Zap className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              Beyond Pricing
            </span>
          </Link>

          <div className="hidden min-w-0 flex-1 justify-center px-5 md:flex">
            <PillTabs tabs={PRIMARY_NAV.map((tab) => ({ href: tab.href, label: tab.label }))} active={activePrimary} />
          </div>

          <div className="flex items-center gap-1.5">
            <NotificationBell />

            <motion.button
              onClick={toggleTheme}
              className="icon-btn"
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"}
              {...buttonMotionProps({ enabled: !reduceMotion })}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.button>

            <motion.button
              onClick={handleLogout}
              disabled={signingOut}
              className="icon-btn"
              title="Terminar sessão"
              aria-label="Terminar sessão"
              {...buttonMotionProps({ enabled: !reduceMotion })}
            >
              <LogOut className="h-4 w-4" />
            </motion.button>

            <span
              className="hidden h-8 w-8 items-center justify-center rounded-full text-xs font-semibold md:inline-flex"
              style={{
                background: "rgba(26, 143, 163, 0.14)",
                border: "1px solid rgba(26, 143, 163, 0.32)",
                color: "var(--accent-blue)",
              }}
              title={userEmail}
            >
              {userInitial}
            </span>
          </div>
        </header>

        <div className="border-b px-3 py-2 md:hidden" style={{ borderColor: "var(--border)" }}>
          <PillTabs tabs={PRIMARY_NAV.map((tab) => ({ href: tab.href, label: tab.label }))} active={activePrimary} />
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-5 md:px-7 md:pb-7 md:pt-6">
          <motion.div
            initial={reduceMotion ? false : "initial"}
            animate={reduceMotion ? undefined : "animate"}
            variants={variants.page}
            transition={transitions.page}
            className="mx-auto w-full app-main-grid"
          >
            <aside className="quick-rail hidden xl:flex">
              {railItems.map((item) => {
                const active = railIsActive(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} className={`quick-rail__link ${active ? "quick-rail__link--active" : ""}`}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </aside>
            <section className="min-w-0">
              {children}
            </section>
          </motion.div>
        </main>
      </SuperShell>

      <HQAssistantWidget />

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md md:hidden"
        style={{
          borderColor: "var(--border)",
          background: "color-mix(in srgb, var(--surface) 88%, transparent)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="mx-auto flex max-w-[1380px] items-stretch justify-around px-1 py-1.5">
          {MOBILE_NAV.map((item) => {
            const active = navIsActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1"
                style={{ color: active ? "#1a8fa3" : "#7d889d" }}
              >
                {active ? (
                  <motion.span
                    layoutId="mobile-nav-pill"
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      background: "rgba(26, 143, 163, 0.12)",
                      border: "1px solid rgba(26, 143, 163, 0.26)",
                    }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <item.icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10 text-[0.63rem] font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants.page}
        transition={transitions.smooth}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
