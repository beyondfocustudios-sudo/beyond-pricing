import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase-server";
import { logPluginRun } from "@/lib/plugins/runtime";
import { ttlFromRegistry } from "@/lib/plugins/registry";

type Coords = { lat: number; lng: number; label: string };

const nominatimResultSchema = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
});

const osrmSchema = z.object({
  routes: z.array(z.object({
    distance: z.number(),
    duration: z.number(),
  })).default([]),
});

function haversineKm(a: Coords, b: Coords) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function geocode(value: string): Promise<Coords | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=1&countrycodes=pt`,
    {
      headers: {
        "User-Agent": "BeyondFocus/1.0 (beyond@beyondfocus.pt)",
        "Accept-Language": "pt",
      },
    },
  );
  if (!response.ok) return null;
  const json = await response.json().catch(() => []);
  const parsed = z.array(nominatimResultSchema).safeParse(json);
  if (!parsed.success) return null;
  const first = parsed.data[0];
  if (!first) return null;
  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    label: first.display_name,
  };
}

function parseCoords(label: string | null, latStr: string | null, lngStr: string | null): Coords | null {
  if (!latStr || !lngStr) return null;
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: label ?? `${lat.toFixed(4)},${lng.toFixed(4)}` };
}

function cacheKey(coords: Coords) {
  return `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const fromText = req.nextUrl.searchParams.get("from");
  const toText = req.nextUrl.searchParams.get("to");

  let from = parseCoords(fromText, req.nextUrl.searchParams.get("fromLat"), req.nextUrl.searchParams.get("fromLng"));
  let to = parseCoords(toText, req.nextUrl.searchParams.get("toLat"), req.nextUrl.searchParams.get("toLng"));

  if (!from && fromText) from = await geocode(fromText);
  if (!to && toText) to = await geocode(toText);

  if (!from || !to) {
    return NextResponse.json({ error: "Parametros from/to invalidos" }, { status: 400 });
  }

  const originKey = cacheKey(from);
  const destinationKey = cacheKey(to);

  const ttlMs = ttlFromRegistry("route") * 1000;
  const { data: cachedRows } = await supabase
    .from("route_cache")
    .select("travel_km, travel_minutes, source, data, fetched_at, expires_at")
    .eq("origin_key", originKey)
    .eq("destination_key", destinationKey)
    .order("fetched_at", { ascending: false })
    .limit(1);

  const cached = cachedRows?.[0] as {
    travel_km?: number;
    travel_minutes?: number;
    source?: string;
    data?: Record<string, unknown>;
    fetched_at?: string;
    expires_at?: string;
  } | undefined;

  if (cached?.travel_km && cached?.travel_minutes && cached.expires_at && new Date(cached.expires_at).getTime() > Date.now()) {
    await logPluginRun({ pluginKey: "route", status: "ok", cacheHit: true, meta: { originKey, destinationKey } });
    return NextResponse.json({
      travel_km: cached.travel_km,
      travel_minutes: cached.travel_minutes,
      source: cached.source ?? "route_cache",
      cacheHit: true,
      stale: false,
      from,
      to,
      data: cached.data ?? {},
    });
  }

  try {
    const osrm = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const response = await fetch(osrm, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error(`OSRM ${response.status}`);

    const raw = await response.json().catch(() => null);
    const parsed = osrmSchema.safeParse(raw);
    if (!parsed.success) throw new Error("Payload inválido de OSRM");
    const route = parsed.data.routes?.[0];
    if (!route) throw new Error("OSRM sem rotas");

    const travelKm = Math.round((route.distance / 1000) * 10) / 10;
    const travelMinutes = Math.round(route.duration / 60);

    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + ttlMs);

    await supabase.from("route_cache").upsert({
      origin_key: originKey,
      destination_key: destinationKey,
      travel_km: travelKm,
      travel_minutes: travelMinutes,
      source: "osrm",
      data: parsed.data,
      fetched_at: fetchedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    }, { onConflict: "origin_key,destination_key" });

    await logPluginRun({ pluginKey: "route", status: "ok", cacheHit: false, meta: { originKey, destinationKey } });

    return NextResponse.json({
      travel_km: travelKm,
      travel_minutes: travelMinutes,
      source: "osrm",
      cacheHit: false,
      stale: false,
      from,
      to,
    });
  } catch (err) {
    const fallbackKm = Math.round(haversineKm(from, to) * 1.3 * 10) / 10;
    const fallbackMinutes = Math.round((fallbackKm / 80) * 60);

    if (cached?.travel_km && cached?.travel_minutes && cached.fetched_at && Date.now() - new Date(cached.fetched_at).getTime() < ttlMs * 3) {
      await logPluginRun({ pluginKey: "route", status: "ok", cacheHit: true, meta: { originKey, destinationKey, stale: true } });
      return NextResponse.json({
        travel_km: cached.travel_km,
        travel_minutes: cached.travel_minutes,
        source: "route_cache_stale",
        cacheHit: true,
        stale: true,
        warning: "API indisponivel. A usar cache recente.",
        from,
        to,
      });
    }

    const message = err instanceof Error ? err.message : "route unavailable";
    await logPluginRun({ pluginKey: "route", status: "error", error: message, meta: { originKey, destinationKey } });

    return NextResponse.json({
      travel_km: fallbackKm,
      travel_minutes: fallbackMinutes,
      source: "haversine",
      cacheHit: false,
      stale: false,
      warning: "A usar estimativa fallback.",
      from,
      to,
    });
  }
}
