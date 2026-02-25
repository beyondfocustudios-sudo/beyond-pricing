"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import PortalShell from "@/components/portal/PortalShell";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthRoute = pathname === "/portal/login" || pathname === "/portal/invite";
  const isPresentationRoute = pathname.startsWith("/portal/presentation/");

  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [impersonation, setImpersonation] = useState<{ clientId: string; clientName: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthRoute) {
      setLoading(false);
      return;
    }

    const sb = createClient();
    sb.auth
      .getUser()
      .then(async ({ data }) => {
        if (!data.user) {
          router.replace("/portal/login");
          return;
        }

        const maybeDisplayName =
          typeof data.user.user_metadata?.full_name === "string"
            ? data.user.user_metadata.full_name
            : typeof data.user.user_metadata?.name === "string"
              ? data.user.user_metadata.name
              : null;

        const impersonationToken =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("impersonate") : null;

        if (impersonationToken) {
          const teamRes = await fetch("/api/auth/validate-audience?audience=team", { cache: "no-store" });
          if (!teamRes.ok) {
            await sb.auth.signOut();
            router.replace("/portal/login?mismatch=1");
            return;
          }

          const impersonationRes = await fetch(
            `/api/portal/impersonation/resolve?token=${encodeURIComponent(impersonationToken)}`,
            { cache: "no-store" },
          );
          if (!impersonationRes.ok) {
            router.replace("/app/clients");
            return;
          }

          const payload = await impersonationRes.json().catch(
            () =>
              ({} as {
                context?: { clientId: string; clientName: string; expiresAt: string };
              }),
          );

          setImpersonation(payload.context ?? null);
          setUserId(data.user.id);
          setEmail(data.user.email ?? null);
          setDisplayName(maybeDisplayName ?? data.user.email ?? null);
          setLoading(false);
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
        setDisplayName(maybeDisplayName ?? data.user.email ?? null);
        setImpersonation(null);
        setLoading(false);
      })
      .catch(() => {
        router.replace("/portal/login");
      });
  }, [isAuthRoute, router]);

  const handleLogout = async () => {
    const sb = createClient();
    await sb.auth.signOut();
    router.push("/portal/login");
  };

  if (isAuthRoute) {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  if (loading) {
    return (
      <ThemeProvider>
        <div className="flex min-h-dvh w-full items-center justify-center" style={{ background: "var(--bg)" }}>
          <div className="h-8 w-8 rounded-full border-2 animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        </div>
      </ThemeProvider>
    );
  }

  if (isPresentationRoute) {
    return (
      <ThemeProvider userId={userId ?? undefined}>
        <ErrorBoundary label="portal-presentation">{children}</ErrorBoundary>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider userId={userId ?? undefined}>
      <PortalShell
        email={email}
        displayName={displayName}
        impersonation={impersonation}
        onLogout={handleLogout}
      >
        {children}
      </PortalShell>
    </ThemeProvider>
  );
}
