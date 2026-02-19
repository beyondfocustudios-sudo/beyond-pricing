// ============================================================
// Beyond Pricing — Ephemeral Supabase Browser Client
// Used for OTP logins where we do NOT want a persistent session.
// persistSession: false  → token is in memory only (tab-lived).
// ============================================================

import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase browser client with persistSession: false.
 * Use this for OTP (email code) logins so the session lives only
 * in memory and is not written to localStorage/sessionStorage.
 *
 * After verifyOtp() completes, the session token won't survive
 * a page refresh — forcing the user to re-authenticate.
 */
export function createEphemeralClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
