import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decodeSessionMeta, isSessionValid } from "@/lib/session";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value }) =>
            supabaseResponse.cookies.set(name, value)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ── Hard-disable legacy gateway routes ──────────────────────
  const legacyLoginPaths = ["/login-gateway", "/gateway", "/role-gateway"];
  if (legacyLoginPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ── Public paths — always allow ─────────────────────────────
  const publicPaths = [
    "/auth/callback",
    "/auth/auth-code-error",
    "/auth/set-session",
    "/login",
    "/portal/login",
    "/reset-password",
  ];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // ── Session TTL enforcement (for authenticated users) ────────
  // If user is logged in but their app-layer TTL has expired, sign
  // them out and redirect to the appropriate login page.
  if (user) {
    const ttlCookie = request.cookies.get(SESSION_COOKIE)?.value;
    const meta = decodeSessionMeta(ttlCookie ? decodeURIComponent(ttlCookie) : undefined);
    if (!isSessionValid(meta)) {
      // TTL expired — sign out and redirect
      await supabase.auth.signOut();
      const loginPath = pathname.startsWith("/portal") ? "/portal/login" : "/login";
      const url = request.nextUrl.clone();
      url.pathname = loginPath;
      url.searchParams.set("expired", "1");
      const redirectResp = NextResponse.redirect(url);
      // Clear session TTL cookie
      redirectResp.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
      return redirectResp;
    }
  }

  // ── Protect /app/* ───────────────────────────────────────────
  if (!user && pathname.startsWith("/app")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ── Protect /portal/* ───────────────────────────────────────
  if (!user && pathname.startsWith("/portal")) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/login";
    return NextResponse.redirect(url);
  }

  // ── Redirect authenticated users away from login pages ──────
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/",
    "/app/:path*",
    "/login",
    "/login-gateway/:path*",
    "/gateway/:path*",
    "/role-gateway/:path*",
    "/portal/:path*",
    "/reset-password",
    "/auth/:path*",
  ],
};
