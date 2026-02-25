"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { LogOut, Moon, Sun, Zap } from "lucide-react";
import { ThemeProvider, useTheme } from "@/components/ThemeProvider";
import { TopScheduleBar } from "@/components/ui-kit";
import { SuperShell } from "@/components/dashboard/super-dashboard";
import HQAssistantWidget from "@/components/HQAssistantWidget";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";

function PortalShell({
  children,
  email,
  onLogout,
}: {
  children: React.ReactNode;
  email: string | null;
  onLogout: () => Promise<void>;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      className="super-theme super-shell-bg h-full min-h-full w-full"
      style={{ padding: "clamp(16px, 2.5vw, 40px)" }}
    >
      <OnboardingGate surface="portal" />
      <SuperShell className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col">
        <header className="super-topbar">
          <Link href="/portal" className="inline-flex items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: "var(--accent-primary)", color: "#fff" }}
            >
              <Zap className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              Beyond Portal
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            {email ? (
              <span className="hidden rounded-full border px-3 py-1 text-xs md:inline-flex" style={{ borderColor: "var(--border-soft)", color: "var(--text-2)" }}>
                {email}
              </span>
            ) : null}
            <button
              onClick={toggleTheme}
              className="icon-btn"
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={() => void onLogout()} className="icon-btn" title="Sair" aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-5 md:px-6 md:pb-8 md:pt-6 xl:px-7">
          <TopScheduleBar className="mb-4" avatars={email ? [email] : []} />
          <div className="surface p-4 sm:p-5">{children}</div>
        </main>
      </SuperShell>
      <HQAssistantWidget />
    </div>
  );
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (pathname === "/portal/login" || pathname === "/portal/invite") {
      setLoading(false);
      return;
    }

    const sb = createClient();
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/portal/login");
        return;
      }

      const [clientRes, teamRes] = await Promise.all([
        fetch("/api/auth/validate-audience?audience=client", { cache: "no-store" }),
        fetch("/api/auth/validate-audience?audience=team", { cache: "no-store" }),
      ]);
      if (!clientRes.ok) {
        if (teamRes.ok) {
          const teamPayload = await teamRes.json().catch(() => ({} as { redirectPath?: string }));
          router.replace(teamPayload.redirectPath ?? "/app/dashboard");
          return;
        }
        await sb.auth.signOut();
        router.replace("/portal/login?mismatch=1");
        return;
      }

      setUserId(data.user.id);
      setEmail(data.user.email ?? null);
      setLoading(false);
    });
  }, [pathname, router]);

  const handleLogout = async () => {
    const sb = createClient();
    await sb.auth.signOut();
    router.push("/portal/login");
  };

  if (pathname === "/portal/login" || pathname === "/portal/invite") {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  if (loading) {
    return (
      <ThemeProvider>
        <div className="h-full min-h-full flex items-center justify-center" style={{ background: "var(--bg)" }}>
          <div className="h-8 w-8 rounded-full border-2 animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider userId={userId ?? undefined}>
      <PortalShell email={email} onLogout={handleLogout}>
        {children}
      </PortalShell>
    </ThemeProvider>
  );
}
