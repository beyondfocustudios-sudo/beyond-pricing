import { NextRequest, NextResponse } from "next/server";

// Beyond Focus base: Setúbal
const BASE_LAT = 38.5243;
const BASE_LNG = -8.8926;

// 30-min cache
const cache = new Map<string, { data: unknown; exp: number }>();

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") ?? "");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }

  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.exp > now) return NextResponse.json(cached.data);

  // Try OSRM public server
  try {
    const osrm = `https://router.project-osrm.org/route/v1/driving/${BASE_LNG},${BASE_LAT};${lng},${lat}?overview=false`;
    const res = await fetch(osrm, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = await res.json() as { routes?: Array<{ distance: number; duration: number }> };
      const route = json.routes?.[0];
      if (route) {
        const result = {
          travel_km: Math.round(route.distance / 100) / 10,
          travel_minutes: Math.round(route.duration / 60),
          mode: "driving" as const,
          source: "osrm" as const,
        };
        cache.set(cacheKey, { data: result, exp: now + 30 * 60 * 1000 });
        return NextResponse.json(result);
      }
    }
  } catch {
    // fall through to haversine
  }

  // Haversine fallback: straight-line × 1.3, avg 80 km/h
  const straight = haversineKm(BASE_LAT, BASE_LNG, lat, lng);
  const km = Math.round(straight * 1.3 * 10) / 10;
  const minutes = Math.round((km / 80) * 60);
  const result = { travel_km: km, travel_minutes: minutes, mode: "driving" as const, source: "haversine" as const };
  cache.set(cacheKey, { data: result, exp: now + 30 * 60 * 1000 });
  return NextResponse.json(result);
}
