// ============================================================
// /auth/callback — Supabase OAuth / PKCE code exchange
// ============================================================
// Handles:
//   1. OAuth redirects (Google, Microsoft/Azure) — code + ttl param
//   2. Password reset emails — code + type=recovery
// After exchanging the code, redirects to /auth/set-session
// so the client-side page can set the TTL cookie and then
// push the user to the correct destination.
// ============================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type"); // "recovery" for password reset

  // Validate `next` to prevent open redirect — only relative paths
  const rawNext = searchParams.get("next") ?? "/app";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app";

  // TTL forwarded from OAuth redirectTo param (e.g. "30d" | "24h")
  const ttl = searchParams.get("ttl") ?? "24h";
  const method = searchParams.get("method");

  const origin = request.headers.get("x-forwarded-host")
    ? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("x-forwarded-host")}`
    : request.nextUrl.origin;

  if (process.env.NODE_ENV === "development") {
    console.log("[callback] code:", code, "type:", type, "ttl:", ttl);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.log("[callback] supabase error:", error.message);
    }
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  // For password reset flow, go directly to reset-password page
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  // For OAuth, redirect to client-side set-session page which sets the TTL
  // cookie and then pushes to the destination.
  const setSessionUrl = new URL(`${origin}/auth/set-session`);
  setSessionUrl.searchParams.set("ttl", ttl);
  setSessionUrl.searchParams.set("next", next);
  if (method) {
    setSessionUrl.searchParams.set("method", method);
  }

  return NextResponse.redirect(setSessionUrl.toString());
}
