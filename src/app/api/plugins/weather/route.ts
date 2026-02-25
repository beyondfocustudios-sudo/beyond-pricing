import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase-server";
import { logPluginRun } from "@/lib/plugins/runtime";
import { ttlFromRegistry } from "@/lib/plugins/registry";

const nominatimResultSchema = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
  name: z.string().optional(),
});

const openMeteoSchema = z.object({
  daily: z.object({
    time: z.array(z.string()).default([]),
    weathercode: z.array(z.number()).default([]),
    temperature_2m_max: z.array(z.number()).default([]),
    temperature_2m_min: z.array(z.number()).default([]),
    precipitation_sum: z.array(z.number()).default([]),
    windspeed_10m_max: z.array(z.number()).default([]),
  }).optional(),
});

function weatherDescription(code: number): string {
  const map: Record<number, string> = {
    0: "Ceu limpo", 1: "Maioritariamente limpo", 2: "Parcialmente nublado", 3: "Nublado",
    45: "Neblina", 48: "Neblina com geada", 51: "Chuvisco ligeiro", 53: "Chuvisco moderado",
    55: "Chuvisco intenso", 61: "Chuva ligeira", 63: "Chuva moderada", 65: "Chuva intensa",
    71: "Neve ligeira", 73: "Neve moderada", 75: "Neve intensa", 80: "Aguaceiros ligeiros",
    81: "Aguaceiros moderados", 82: "Aguaceiros fortes", 95: "Trovoada",
  };
  return map[code] ?? "Desconhecido";
}

async function geocodeLocation(location: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1&countrycodes=pt`,
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
    locationName: first.name ?? first.display_name,
  };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const location = req.nextUrl.searchParams.get("location");
  const latParam = req.nextUrl.searchParams.get("lat");
  const lngParam = req.nextUrl.searchParams.get("lng");

  let lat = latParam ? Number(latParam) : NaN;
  let lng = lngParam ? Number(lngParam) : NaN;
  let locationName = location ?? null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    if (!location) {
      return NextResponse.json({ error: "location ou lat/lng obrigatorios" }, { status: 400 });
    }
    const geocoded = await geocodeLocation(location);
    if (!geocoded) {
      return NextResponse.json({ error: "Nao foi possivel geocodificar local" }, { status: 404 });
    }
    lat = geocoded.lat;
    lng = geocoded.lng;
    locationName = geocoded.locationName;
  }

  const today = new Date().toISOString().slice(0, 10);
  const locationKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const ttlMs = ttlFromRegistry("weather") * 1000;

  const { data: cacheRows } = await supabase
    .from("weather_cache")
    .select("id, data, fetched_at")
    .eq("location", locationKey)
    .eq("date", today)
    .order("fetched_at", { ascending: false })
    .limit(1);

  const cached = cacheRows?.[0] as { data?: Record<string, unknown>; fetched_at?: string } | undefined;
  if (cached?.data && cached.fetched_at && Date.now() - new Date(cached.fetched_at).getTime() < ttlMs) {
    await logPluginRun({ pluginKey: "weather", status: "ok", cacheHit: true, meta: { location: locationKey } });
    return NextResponse.json({
      ok: true,
      cacheHit: true,
      stale: false,
      source: "weather_cache",
      location: { lat, lng, name: locationName },
      ...cached.data,
    });
  }

  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max");
    url.searchParams.set("timezone", "Europe/Lisbon");
    url.searchParams.set("start_date", today);
    url.searchParams.set("end_date", endDate.toISOString().slice(0, 10));

    const response = await fetch(url.toString(), { next: { revalidate: 60 * 30 } });
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);

    const raw = await response.json().catch(() => null);
    const parsed = openMeteoSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Payload inválido de Open-Meteo");
    }
    const daily = parsed.data.daily;

    const days = (daily?.time ?? []).map((date, index) => ({
      date,
      weather_code: daily?.weathercode?.[index] ?? null,
      weather_label: weatherDescription(daily?.weathercode?.[index] ?? -1),
      temp_max: daily?.temperature_2m_max?.[index] ?? null,
      temp_min: daily?.temperature_2m_min?.[index] ?? null,
      precipitation_sum: daily?.precipitation_sum?.[index] ?? null,
      windspeed_max: daily?.windspeed_10m_max?.[index] ?? null,
    }));

    const payload = {
      forecast_start: today,
      forecast_end: endDate.toISOString().slice(0, 10),
      days,
      fetched_at: new Date().toISOString(),
    };

    await supabase.from("weather_cache").upsert({
      location: locationKey,
      lat,
      lon: lng,
      date: today,
      data: payload,
      fetched_at: payload.fetched_at,
    }, { onConflict: "location,date" });

    await logPluginRun({ pluginKey: "weather", status: "ok", cacheHit: false, meta: { location: locationKey } });
    return NextResponse.json({
      ok: true,
      cacheHit: false,
      stale: false,
      source: "open-meteo",
      location: { lat, lng, name: locationName },
      ...payload,
    });
  } catch (err) {
    if (cached?.data) {
      await logPluginRun({ pluginKey: "weather", status: "ok", cacheHit: true, meta: { location: locationKey, stale: true } });
      return NextResponse.json({
        ok: true,
        cacheHit: true,
        stale: true,
        source: "weather_cache_stale",
        warning: "Dados em cache (API indisponivel)",
        location: { lat, lng, name: locationName },
        ...cached.data,
      });
    }

    const message = err instanceof Error ? err.message : "Weather unavailable";
    await logPluginRun({ pluginKey: "weather", status: "error", cacheHit: false, error: message, meta: { location: locationKey } });
    return NextResponse.json({
      error: "Nao foi possivel carregar weather. Usa override manual temporario.",
      detail: message,
    }, { status: 502 });
  }
}
