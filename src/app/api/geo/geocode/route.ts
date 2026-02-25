import { NextRequest, NextResponse } from "next/server";

// 30-min in-memory cache
const cache = new Map<string, { data: unknown; exp: number }>();

// Simple rate limit: 30 req/min per IP
const rl = new Map<string, { count: number; reset: number }>();

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });

  // Rate limit
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const now = Date.now();
  const entry = rl.get(ip) ?? { count: 0, reset: now + 60_000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000; }
  entry.count++;
  rl.set(ip, entry);
  if (entry.count > 30) {
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  }

  // Cache check
  const cacheKey = q.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.exp > now) {
    return NextResponse.json(cached.data);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=pt`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BeyondFocus/1.0 (beyond@beyondfocus.pt)",
        "Accept-Language": "pt",
      },
    });

    if (!res.ok) throw new Error(`Nominatim ${res.status}`);

    const json = await res.json() as Array<{ lat: string; lon: string; display_name: string }>;
    const result = json[0]
      ? {
          lat: parseFloat(json[0].lat),
          lng: parseFloat(json[0].lon),
          label: json[0].display_name,
          name: (json[0].display_name ?? "").split(",")[0]?.trim() || json[0].display_name,
          address: json[0].display_name,
        }
      : null;

    cache.set(cacheKey, { data: result, exp: now + 30 * 60 * 1000 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
