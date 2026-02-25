import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { logPluginRun } from "@/lib/plugins/runtime";
import { ttlFromRegistry } from "@/lib/plugins/registry";

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
  const json = await response.json() as Array<{ lat: string; lon: string; display_name: string; name?: string }>;
  const first = json[0];
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

    const raw = await response.json() as {
      daily?: {
        time: string[];
        weathercode: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
        windspeed_10m_max: number[];
      };
    };

    const days = (raw.daily?.time ?? []).map((date, index) => ({
      date,
      weather_code: raw.daily?.weathercode?.[index] ?? null,
      weather_label: weatherDescription(raw.daily?.weathercode?.[index] ?? -1),
      temp_max: raw.daily?.temperature_2m_max?.[index] ?? null,
      temp_min: raw.daily?.temperature_2m_min?.[index] ?? null,
      precipitation_sum: raw.daily?.precipitation_sum?.[index] ?? null,
      windspeed_max: raw.daily?.windspeed_10m_max?.[index] ?? null,
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
