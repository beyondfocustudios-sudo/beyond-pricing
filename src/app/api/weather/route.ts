import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// 30-min in-memory cache keyed by lat,lng
const memCache = new Map<string, { data: unknown; exp: number }>();

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = rateLimit(`weather:${ip}`, { max: 60, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const latParam = req.nextUrl.searchParams.get("lat");
  const lngParam = req.nextUrl.searchParams.get("lng");
  const projectId = req.nextUrl.searchParams.get("projectId");
  const startDate = req.nextUrl.searchParams.get("start");
  const endDate = req.nextUrl.searchParams.get("end");

  // Support old ?location= param for backward compat
  const locationParam = req.nextUrl.searchParams.get("location");
  const dateParam = req.nextUrl.searchParams.get("date");

  let lat: number;
  let lng: number;

  if (latParam && lngParam) {
    lat = parseFloat(latParam);
    lng = parseFloat(lngParam);
    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: "lat/lng inválidos" }, { status: 400 });
    }
  } else if (locationParam) {
    // Legacy: geocode location string
    const coords = await geocodeLocation(locationParam);
    if (!coords) return NextResponse.json({ error: "Localização não encontrada" }, { status: 404 });
    lat = coords.lat;
    lng = coords.lng;
  } else {
    return NextResponse.json({ error: "lat+lng ou location obrigatório" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const forecast_start = startDate ?? dateParam ?? today;
  // For 8-day forecast, set end 7 days after start
  const d = new Date(forecast_start);
  d.setDate(d.getDate() + 7);
  const forecast_end = endDate ?? d.toISOString().slice(0, 10);

  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${forecast_start}`;
  const now = Date.now();
  const cached = memCache.get(cacheKey);
  if (cached && cached.exp > now) {
    return NextResponse.json(cached.data);
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,sunrise,sunset");
  url.searchParams.set("timezone", "Europe/Lisbon");
  url.searchParams.set("start_date", forecast_start);
  url.searchParams.set("end_date", forecast_end);

  const res = await fetch(url.toString());
  if (!res.ok) return NextResponse.json({ error: "Erro ao obter dados meteorológicos" }, { status: 502 });

  const raw = await res.json() as {
    daily?: {
      time: string[];
      weathercode: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      windspeed_10m_max: number[];
      sunrise: string[];
      sunset: string[];
    };
  };

  const days = (raw.daily?.time ?? []).map((date, i) => ({
    date,
    code: raw.daily!.weathercode[i],
    description: weatherDescription(raw.daily!.weathercode[i]),
    temp_max: raw.daily!.temperature_2m_max[i],
    temp_min: raw.daily!.temperature_2m_min[i],
    precipitation: raw.daily!.precipitation_sum[i],
    wind_max: raw.daily!.windspeed_10m_max[i],
    sunrise: raw.daily!.sunrise?.[i],
    sunset: raw.daily!.sunset?.[i],
  }));

  const result = { lat, lng, forecast_start, forecast_end, days, fetched_at: new Date().toISOString() };
  memCache.set(cacheKey, { data: result, exp: now + 30 * 60 * 1000 });

  // Optionally save snapshot to project
  if (projectId) {
    try {
      const sb = await createClient();
      await sb.from("projects").update({
        weather_snapshot: result,
        weather_last_synced_at: new Date().toISOString(),
      }).eq("id", projectId);
    } catch { /* non-critical */ }
  }

  return NextResponse.json(result);
}

async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  const PT: Record<string, { lat: number; lng: number }> = {
    "Lisboa": { lat: 38.7167, lng: -9.1333 },
    "Porto": { lat: 41.1495, lng: -8.6108 },
    "Braga": { lat: 41.5454, lng: -8.4265 },
    "Coimbra": { lat: 40.2033, lng: -8.4103 },
    "Faro": { lat: 37.0194, lng: -7.9322 },
    "Aveiro": { lat: 40.6443, lng: -8.6455 },
    "Évora": { lat: 38.5708, lng: -7.9050 },
    "Setúbal": { lat: 38.5244, lng: -8.8882 },
    "Funchal": { lat: 32.6669, lng: -16.9241 },
    "Ponta Delgada": { lat: 37.7412, lng: -25.6756 },
  };
  const key = Object.keys(PT).find((k) => location.toLowerCase().includes(k.toLowerCase()));
  if (key) return PT[key];

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { "User-Agent": "BeyondFocusApp/1.0" } }
    );
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* ignore */ }
  return null;
}

function weatherDescription(code: number): string {
  const map: Record<number, string> = {
    0: "☀️ Céu limpo", 1: "🌤 Maioritariamente limpo", 2: "⛅ Parcialmente nublado", 3: "☁️ Nublado",
    45: "🌫 Neblina", 48: "🌫 Geada por neblina", 51: "🌦 Chuvisco ligeiro", 53: "🌧 Chuvisco moderado",
    55: "🌧 Chuvisco intenso", 61: "🌧 Chuva ligeira", 63: "🌧 Chuva moderada", 65: "🌧 Chuva intensa",
    71: "🌨 Neve ligeira", 73: "❄️ Neve moderada", 75: "❄️ Neve intensa", 80: "🌦 Aguaceiros ligeiros",
    81: "🌦 Aguaceiros moderados", 82: "⛈ Aguaceiros intensos", 95: "⛈ Trovoada",
    96: "⛈ Trovoada c/ granizo", 99: "⛈ Trovoada intensa c/ granizo",
  };
  return map[code] ?? "🌡 Desconhecido";
}
