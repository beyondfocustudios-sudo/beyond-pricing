// ============================================================
// Beyond Pricing — Session TTL Helpers
// ============================================================
// We implement session duration control at the app layer
// because Supabase's access tokens have a fixed server-side
// expiry (default 1 hour). We extend perceived session life
// via a cookie that tracks login_at + desired ttl.
//
// Flow:
//   1. After successful login, call setSessionTtl(ttlSeconds)
//   2. In middleware, call checkSessionTtl() — returns false if expired
//   3. If expired, middleware calls supabase.auth.signOut() + redirect
//
// TTL presets:
//   SHORT  = 60 min  (OTP sessions, portal)
//   DAY    = 24 h    (password/OAuth without "remember me")
//   LONG   = 30 days (password/OAuth with "remember me")
// ============================================================

export const SESSION_TTL = {
  SHORT: 60 * 60,           // 1 hour (OTP, portal clients)
  DAY: 24 * 60 * 60,        // 24 hours (default password/OAuth)
  LONG: 30 * 24 * 60 * 60,  // 30 days (remember me)
} as const;

export const SESSION_COOKIE = "bp_session_ttl";

export interface SessionMeta {
  login_at: number;   // unix seconds
  ttl: number;        // seconds
}

/**
 * Encode session metadata as a cookie value.
 */
export function encodeSessionMeta(ttlSeconds: number): string {
  const meta: SessionMeta = {
    login_at: Math.floor(Date.now() / 1000),
    ttl: ttlSeconds,
  };
  return JSON.stringify(meta);
}

/**
 * Decode cookie value into SessionMeta. Returns null if invalid.
 */
export function decodeSessionMeta(cookieValue: string | undefined): SessionMeta | null {
  if (!cookieValue) return null;
  try {
    const parsed = JSON.parse(cookieValue) as Partial<SessionMeta>;
    if (typeof parsed.login_at !== "number" || typeof parsed.ttl !== "number") return null;
    return parsed as SessionMeta;
  } catch {
    return null;
  }
}

/**
 * Returns true if the session is still valid (not expired).
 */
export function isSessionValid(meta: SessionMeta | null): boolean {
  if (!meta) return true; // no TTL cookie = let Supabase decide
  const now = Math.floor(Date.now() / 1000);
  return now < meta.login_at + meta.ttl;
}

/**
 * Client-side: set the session TTL cookie after login.
 * HttpOnly is NOT set here (we need client-side JS to read it for
 * redirect decisions), but middleware also reads it server-side.
 */
export function setSessionCookieClient(ttlSeconds: number): void {
  const value = encodeSessionMeta(ttlSeconds);
  const maxAgeSeconds = ttlSeconds;
  const sameSite = "Lax";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=${sameSite}${secure}`;
}

/**
 * Client-side: clear the session TTL cookie (called on logout).
 */
export function clearSessionCookieClient(): void {
  document.cookie = `${SESSION_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/**
 * Client-side: read and parse the session meta from document.cookie.
 */
export function readSessionMetaClient(): SessionMeta | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.split("=").slice(1).join("="));
  return decodeSessionMeta(value);
}
