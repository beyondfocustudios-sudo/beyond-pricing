/**
 * Simple in-process rate limiter (LRU map by key).
 * Good enough for single-instance Vercel; for multi-instance use Upstash Redis.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    store.forEach((v, k) => { if (v.resetAt < now) store.delete(k); });
  }, 5 * 60 * 1000);
}

export interface RateLimitOptions {
  /** Max requests in window */
  max: number;
  /** Window duration in seconds */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowMs = opts.windowSec * 1000;
  let entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;
  const allowed = entry.count <= opts.max;
  return { allowed, remaining: Math.max(0, opts.max - entry.count), resetAt: entry.resetAt };
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({ error: "Demasiadas tentativas. Aguarda e tenta novamente." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    }
  );
}
