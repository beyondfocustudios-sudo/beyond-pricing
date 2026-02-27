"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Mail,
  Package,
  Search,
  SunMoon,
  UserCircle2,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import DebugBuildStamp from "@/components/DebugBuildStamp";
import { InboxDrawer } from "@/app/portal/components/InboxDrawer";
import { PortalProviders } from "@/app/portal/Providers";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/portal", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portal/projects", label: "Projects", icon: Zap },
  { href: "/portal/deliveries", label: "Deliveries", icon: Package },
  { href: "/portal/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/portal/inbox", label: "Inbox", icon: Mail },
];

function isAuthFreePath(pathname: string) {
  return pathname === "/portal/login" || pathname === "/portal/invite";
}

function navActive(pathname: string, href: string) {
  if (href === "/portal") return pathname === "/portal";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function PortalChrome({
  children,
  email,
  onLogout,
}: {
  children: ReactNode;
  email: string | null;
  onLogout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toggleTheme } = useTheme();
  const searchKey = searchParams.toString();
  const query = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(query);

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchKey);
      const value = searchInput.trim();
      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      const next = params.toString();
      const target = next ? `${pathname}?${next}` : pathname;
      const current = searchKey ? `${pathname}?${searchKey}` : pathname;
      if (target !== current) {
        router.replace(target, { scroll: false });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchInput, pathname, router, searchKey]);

  return (
    <div className="super-theme super-shell-bg min-h-dvh w-full">
      <OnboardingGate surface="portal" />
      <div className="grid min-h-dvh w-full lg:grid-cols-[88px_minmax(0,1fr)]">
        <aside className="hidden border-r lg:flex lg:h-dvh lg:flex-col lg:items-center lg:justify-between lg:py-6" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 88%, transparent)" }}>
          <Link href="/portal" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "var(--accent-primary)", color: "#fff" }}>
            <Zap className="h-5 w-5" />
          </Link>

          <nav className="flex flex-1 flex-col items-center gap-2 pt-10">
            {NAV_ITEMS.map((item) => {
              const active = navActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition"
                  style={{
                    borderColor: active ? "rgba(26,143,163,0.35)" : "transparent",
                    background: active ? "rgba(26,143,163,0.13)" : "transparent",
                    color: active ? "var(--accent-blue)" : "var(--text-3)",
                  }}
                >
                  <item.icon className="h-4 w-4" />
                </Link>
              );
            })}
          </nav>

          <button onClick={() => void onLogout()} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
            <LogOut className="h-4 w-4" />
          </button>
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col">
          <header className="border-b backdrop-blur-xl" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 92%, transparent)" }}>
            <div className="flex min-h-[74px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.12em]" style={{ color: "var(--text-3)" }}>Beyond Portal</p>
                <h1 className="truncate text-[1.15rem] font-semibold tracking-[-0.02em]" style={{ color: "var(--text)" }}>
                  Cliente Dashboard
                </h1>
              </div>

              <label className="table-search-pill hidden w-[280px] md:flex">
                <Search className="h-3.5 w-3.5" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search projects, deliveries, inbox"
                  aria-label="Search portal"
                />
              </label>

              <button
                onClick={toggleTheme}
                className="icon-btn"
                title="Alternar tema"
                aria-label="Alternar tema"
              >
                <SunMoon className="h-4 w-4" />
              </button>

              <div className="hidden items-center gap-2 rounded-full border px-3 py-1.5 sm:flex" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                <UserCircle2 className="h-4 w-4" />
                <span className="max-w-[220px] truncate text-xs">{email ?? "cliente"}</span>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="min-h-full px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
              <ErrorBoundary label="portal">
                {children}
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t px-2 py-1.5 backdrop-blur-xl lg:hidden"
        style={{
          borderColor: "var(--border)",
          background: "color-mix(in srgb, var(--surface) 94%, transparent)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-between gap-1">
          {NAV_ITEMS.map((item) => {
            const active = navActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px]"
                style={{
                  color: active ? "var(--accent-blue)" : "var(--text-3)",
                  background: active ? "rgba(26,143,163,0.12)" : "transparent",
                }}
              >
                <item.icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <DebugBuildStamp />
    </div>
  );
}

export default function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthFreePath(pathname)) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const sb = createClient();
        const {
          data: { user },
        } = await sb.auth.getUser();

        if (!user) {
          router.replace("/portal/login");
          return;
        }

        const [clientRoleRes, teamRoleRes] = await Promise.all([
          fetch("/api/auth/validate-audience?audience=client", { cache: "no-store" }),
          fetch("/api/auth/validate-audience?audience=team", { cache: "no-store" }),
        ]);

        if (!clientRoleRes.ok) {
          if (teamRoleRes.ok) {
            const teamPayload = await teamRoleRes.json().catch(() => ({}) as { redirectPath?: string });
            router.replace(teamPayload.redirectPath ?? "/app/dashboard");
            return;
          }

          await sb.auth.signOut();
          router.replace("/portal/login?mismatch=1");
          return;
        }

        if (!cancelled) {
          setUserId(user.id);
          setEmail(user.email ?? null);
          setLoading(false);
        }
      } catch {
        router.replace("/portal/login");
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  const handleLogout = async () => {
    const sb = createClient();
    await sb.auth.signOut();
    router.push("/portal/login");
    router.refresh();
  };

  if (isAuthFreePath(pathname)) {
    return <PortalProviders>{children}</PortalProviders>;
  }

  if (loading) {
    return (
      <PortalProviders>
        <div className="flex min-h-dvh w-full items-center justify-center" style={{ background: "var(--bg)" }}>
          <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        </div>
      </PortalProviders>
    );
  }

  return (
    <PortalProviders userId={userId ?? undefined}>
      <PortalChrome email={email} onLogout={handleLogout}>
        {children}
      </PortalChrome>
      <InboxDrawer />
    </PortalProviders>
  );
}
