"use client";

// ============================================================
// /auth/set-session — client-side TTL cookie setter
// ============================================================
// After OAuth callback, the server route redirects here with
// ?ttl=30d|24h&next=/app so we can call setSessionCookieClient
// (which requires document.cookie) and then push the user on.
// This page renders nothing visible — it's a redirect shim.
//
// NOTE: useSearchParams() requires a Suspense boundary at build
// time. We export the inner component wrapped in Suspense.
// ============================================================

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { clearSessionCookieClient, setSessionCookieClient, SESSION_TTL } from "@/lib/session";
import { parseAudience } from "@/lib/login-audience";

function SetSessionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const run = async () => {
      const ttlParam = searchParams.get("ttl") ?? "24h";
      const rawNext = searchParams.get("next") ?? "/app";
      const audience = parseAudience(searchParams.get("audience"));

      // Validate next to prevent open redirect
      const next =
        rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app";

      // Map ttl param to seconds
      const ttlSeconds =
        ttlParam === "30d"
          ? SESSION_TTL.LONG
          : ttlParam === "1h"
            ? SESSION_TTL.SHORT
            : SESSION_TTL.DAY; // "24h" default

      setSessionCookieClient(ttlSeconds);

      if (audience) {
        const res = await fetch(`/api/auth/validate-audience?audience=${audience}`, { cache: "no-store" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({} as { suggestedPath?: string }));
          const suggestedPath = typeof data?.suggestedPath === "string"
            ? data.suggestedPath
            : audience === "client"
              ? "/portal/login?mode=client"
              : audience === "collaborator"
                ? "/portal/login?mode=collaborator"
                : "/login?mode=team";

          try {
            const sb = createClient();
            await sb.auth.signOut();
          } catch {
            // Keep redirect fallback.
          }
          clearSessionCookieClient();
          const mismatchPath = suggestedPath.includes("?")
            ? `${suggestedPath}&mismatch=1`
            : `${suggestedPath}?mismatch=1`;
          router.replace(mismatchPath);
          return;
        }
      }

      router.replace(next);
    };

    void run();
  }, [router, searchParams]);

  return null;
}

function LoadingSpinner() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: "#f5f5f7",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      }}
    >
      <div className="flex flex-col items-center gap-3">
        <svg
          className="animate-spin h-6 w-6"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          style={{ color: "#1a8fa3" }}
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8z"
          />
        </svg>
        <p className="text-sm" style={{ color: "#86868b" }}>
          A entrar…
        </p>
      </div>
    </div>
  );
}

export default function SetSessionPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SetSessionInner />
    </Suspense>
  );
}
