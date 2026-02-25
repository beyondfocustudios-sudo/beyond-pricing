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

function SetSessionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const run = async () => {
      const ttlParam = searchParams.get("ttl") ?? "24h";
      const rawNext = searchParams.get("next") ?? "/app";
      const method = searchParams.get("method");

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

      let finalNext = next;
      const res = await fetch("/api/auth/resolve-access", { cache: "no-store" });
      if (!res.ok) {
        try {
          const sb = createClient();
          await sb.auth.signOut();
        } catch {
          // Keep redirect fallback.
        }
        clearSessionCookieClient();
        router.replace("/login?mismatch=1");
        return;
      }

      const data = await res.json().catch(() => ({} as { redirectPath?: string }));
      if (typeof data.redirectPath === "string" && data.redirectPath.startsWith("/")) {
        finalNext = data.redirectPath;
      }

      if (typeof window !== "undefined" && method) {
        try {
          window.localStorage.setItem("bp_last_login_method", method);
          const sb = createClient();
          const { data: authData } = await sb.auth.getUser();
          if (authData.user?.email) {
            window.localStorage.setItem("bp_last_login_email", authData.user.email.toLowerCase());
          }
        } catch {
          // Ignore localStorage/write failures.
        }
      }

      router.replace(finalNext);
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
