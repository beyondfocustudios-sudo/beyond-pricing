"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  SunMoon,
  Zap,
  UserRound,
  Search,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import NotificationBell from "@/components/NotificationBell";
import { useTheme } from "@/components/ThemeProvider";
import { PillTabs } from "@/components/dashboard/super-dashboard";
import { buttonMotionProps, transitions, variants } from "@/lib/motion";
import HQAssistantWidget from "@/components/HQAssistantWidget";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import DebugBuildStamp from "@/components/DebugBuildStamp";

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

const PRIMARY_NAV_OWNER_ADMIN: NavItem[] = [
  ...PRIMARY_NAV.slice(0, 5),
  { href: "/app/integrations", label: "Integrations", icon: Zap },
  PRIMARY_NAV[5],
];

const PRIMARY_NAV_COLLABORATOR: NavItem[] = [
  { href: "/app/collaborator", label: "Home", icon: LayoutDashboard },
  { href: "/app/projects", label: "Projects", icon: Calculator },
  { href: "/app/tasks", label: "Tasks", icon: ListTodo },
  { href: "/app/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/app/preferences", label: "Perfil", icon: UserRound },
];

const SECONDARY_NAV: NavItem[] = [
  { href: "/app/templates", label: "Templates", icon: FileText },
  { href: "/app/tasks", label: "Tasks", icon: ListTodo },
  { href: "/app/crm", label: "CRM", icon: Users2 },
  { href: "/app/callsheets", label: "Call Sheets", icon: ClipboardList },
  { href: "/app/diagnostics", label: "Diagnostics", icon: Activity },
  { href: "/app/support", label: "Support", icon: LifeBuoy },
];

const CEO_RAIL: NavItem[] = [
  { href: "/app/tasks", label: "My Tasks", icon: ListTodo },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/app/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/app/checklists", label: "Checklists", icon: CheckSquare },
  { href: "/app/journal", label: "Journal", icon: BookOpen },
];

const COLLABORATOR_RAIL: NavItem[] = [
  { href: "/app/projects", label: "Projetos", icon: Calculator },
  { href: "/app/tasks", label: "Tarefas", icon: ListTodo },
  { href: "/app/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/app/preferences", label: "Perfil", icon: UserRound },
];

const MOBILE_NAV: NavItem[] = [
  { href: "/app/dashboard", label: "Dash", icon: LayoutDashboard },
  { href: "/app/projects", label: "Projects", icon: Calculator },
  { href: "/app/clients", label: "Clients", icon: Building2 },
  { href: "/app/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV_COLLABORATOR: NavItem[] = [
  { href: "/app/collaborator", label: "Home", icon: LayoutDashboard },
  { href: "/app/projects", label: "Projects", icon: Calculator },
  { href: "/app/tasks", label: "Tasks", icon: ListTodo },
  { href: "/app/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/app/preferences", label: "Perfil", icon: UserRound },
];

function navIsActive(pathname: string, href: string) {
  if (pathname === "/app/preferences" && href === "/app/settings") return true;
  if (href === "/app/dashboard") return pathname === "/app" || pathname === "/app/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolvePrimaryActive(pathname: string, tabs: NavItem[]) {
  const found = tabs.find((tab) => navIsActive(pathname, tab.href));
  return found?.href ?? tabs[0]?.href ?? "/app/dashboard";
}

function railIsActive(pathname: string, href: string) {
  if (href === "/app/dashboard") return pathname === "/app" || pathname === "/app/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  userEmail,
  userRole,
  buildStamp,
}: {
  children: ReactNode;
  userEmail: string;
  userRole: "owner" | "admin" | "member" | "collaborator" | "client" | "unknown";
  buildStamp: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const { toggleTheme, dashboardMode } = useTheme();
  const reduceMotion = useReducedMotion();
  const isCollaborator = userRole === "collaborator";
  const isOwnerAdmin = userRole === "owner" || userRole === "admin";
  const primaryNav = useMemo(() => {
    if (isCollaborator) return PRIMARY_NAV_COLLABORATOR;
    if (isOwnerAdmin) return PRIMARY_NAV_OWNER_ADMIN;
    return PRIMARY_NAV;
  }, [isCollaborator, isOwnerAdmin]);
  const mobileNav = useMemo(() => (isCollaborator ? MOBILE_NAV_COLLABORATOR : MOBILE_NAV), [isCollaborator]);
  const activePrimary = useMemo(() => resolvePrimaryActive(pathname, primaryNav), [pathname, primaryNav]);
  const isCeoMode = dashboardMode === "ceo";
  const railItems = isCollaborator ? COLLABORATOR_RAIL : isCeoMode ? CEO_RAIL : SECONDARY_NAV;
  const isDashboardRoute = pathname === "/app" || pathname.startsWith("/app/dashboard");
  const dashboardSearch = searchParams.get("q") ?? "";

  const updateDashboardSearch = (value: string) => {
    if (!isDashboardRoute) return;
    const params = new URLSearchParams(searchParams.toString());
    const nextValue = value.trim();
    if (nextValue.length > 0) {
      params.set("q", nextValue);
    } else {
      params.delete("q");
    }
    const nextUrl = params.toString().length > 0 ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  };

  const handleLogout = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const userInitial = (userEmail?.[0] ?? "U").toUpperCase();

  return (
    <div className="super-theme super-shell-bg h-full min-h-dvh w-full">
      <OnboardingGate surface="app" collaboratorMode={isCollaborator} />
      <div className="super-app-surface">
        <header className="super-topbar">
          <div className="super-topbar__inner">
            <Link href={isCollaborator ? "/app/collaborator" : "/app/dashboard"} className="inline-flex items-center gap-2.5">
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
              <PillTabs tabs={primaryNav.map((tab) => ({ href: tab.href, label: tab.label }))} active={activePrimary} />
            </div>

            <div className="flex items-center gap-1.5">
              {isDashboardRoute ? (
                <label className="table-search-pill hidden w-56 md:flex">
                  <Search className="h-3.5 w-3.5" />
                  <input
                    value={dashboardSearch}
                    onChange={(event) => updateDashboardSearch(event.target.value)}
                    placeholder="Pesquisar updates"
                    aria-label="Pesquisar updates"
                  />
                </label>
              ) : null}

              <NotificationBell />

              <motion.button
                onClick={toggleTheme}
                className="icon-btn"
                title="Alternar tema"
                aria-label="Alternar tema"
                {...buttonMotionProps({ enabled: !reduceMotion })}
              >
                <SunMoon className="h-4 w-4" />
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
          </div>
        </header>

        <div className="border-b md:hidden" style={{ borderColor: "var(--border)" }}>
          <div className="shell-inner py-2">
            <PillTabs tabs={primaryNav.map((tab) => ({ href: tab.href, label: tab.label }))} active={activePrimary} />
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <motion.div
            initial={reduceMotion ? false : "initial"}
            animate={reduceMotion ? undefined : "animate"}
            variants={variants.page}
            transition={transitions.page}
            className="shell-inner app-main-grid items-start pb-24 pt-5 md:pb-8 md:pt-6"
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

        <footer className="border-t" style={{ borderColor: "var(--border-soft)" }}>
          <div className="shell-inner py-2 text-[0.68rem]" style={{ color: "var(--text-3)" }}>
            Build: {buildStamp}
          </div>
        </footer>
      </div>

      <HQAssistantWidget />
      <DebugBuildStamp />

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md md:hidden"
        style={{
          borderColor: "var(--border)",
          background: "color-mix(in srgb, var(--surface) 88%, transparent)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-stretch justify-around px-2 py-1.5">
          {mobileNav.map((item) => {
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
                    transition={transitions.ui}
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
