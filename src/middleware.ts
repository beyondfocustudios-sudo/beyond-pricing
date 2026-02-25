import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decodeSessionMeta, isSessionValid } from "@/lib/session";
import { defaultAppPathForRole, isCollaboratorAllowedPath, resolveAccessRole } from "@/lib/access-role";

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

  const resolveAccess = async () => (user ? resolveAccessRole(supabase, user) : null);

  // ── Public paths — always allow (except login redirects) ─────
  const publicPaths = [
    "/auth/callback",
    "/auth/auth-code-error",
    "/auth/set-session",
    "/login",
    "/portal/login",
    "/portal/invite",
    "/reset-password",
  ];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    if (user && (pathname === "/login" || pathname === "/portal/login")) {
      const access = await resolveAccess();
      if (!access) return supabaseResponse;

      if (pathname === "/portal/login") {
        if (access.isClient) {
          const url = request.nextUrl.clone();
          url.pathname = "/portal";
          return NextResponse.redirect(url);
        }
        const url = request.nextUrl.clone();
        url.pathname = defaultAppPathForRole(access.role);
        return NextResponse.redirect(url);
      }

      if (access.isClient) {
        const url = request.nextUrl.clone();
        url.pathname = "/portal/login";
        url.searchParams.set("mode", "client");
        return NextResponse.redirect(url);
      }

      const url = request.nextUrl.clone();
      url.pathname = defaultAppPathForRole(access.role);
      return NextResponse.redirect(url);
    }
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

  if (user && (pathname.startsWith("/app") || pathname.startsWith("/portal"))) {
    const access = await resolveAccess();
    if (!access) return supabaseResponse;
    const impersonationToken = request.nextUrl.searchParams.get("impersonate");

    if (pathname.startsWith("/portal")) {
      if (impersonationToken && access.isTeam) {
        return supabaseResponse;
      }
      if (!access.isClient) {
        const url = request.nextUrl.clone();
        url.pathname = defaultAppPathForRole(access.role);
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    if (access.isClient && !access.isTeam && !access.isCollaborator) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal";
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/app/integrations") && access.role !== "owner" && access.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = defaultAppPathForRole(access.role);
      return NextResponse.redirect(url);
    }

    if (access.isCollaborator && !access.isTeam) {
      if (pathname === "/app" || pathname === "/app/dashboard") {
        const url = request.nextUrl.clone();
        url.pathname = "/app/collaborator";
        return NextResponse.redirect(url);
      }
      if (!isCollaboratorAllowedPath(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = "/app/collaborator";
        url.searchParams.set("restricted", "1");
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/app/:path*", "/login", "/portal/:path*", "/reset-password", "/auth/:path*"],
};
