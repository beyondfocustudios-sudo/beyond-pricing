import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// GET /api/weather?location=Lisboa&date=2026-02-20
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = rateLimit(`weather:${ip}`, { max: 60, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const location = req.nextUrl.searchParams.get("location");
  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  if (!location) return NextResponse.json({ error: "location obrigatório" }, { status: 400 });

  // Check cache (1h for today, 6h for future)
  const { data: cached } = await sb.from("weather_cache")
    .select("data, fetched_at")
    .eq("location", location)
    .eq("date", date)
    .maybeSingle();

  if (cached) {
    const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
    const maxAge = date === new Date().toISOString().slice(0, 10) ? 3600000 : 21600000;
    if (ageMs < maxAge) {
      return NextResponse.json({ weather: cached.data, fromCache: true });
    }
  }

  // Geocode location (simple lookup for common PT cities, fallback to coords)
  const coords = await geocode(location);
  if (!coords) return NextResponse.json({ error: "Localização não encontrada" }, { status: 404 });

  // Open-Meteo (free, no key required)
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(coords.lat));
  url.searchParams.set("longitude", String(coords.lon));
  url.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,sunrise,sunset");
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weathercode,windspeed_10m,relativehumidity_2m");
  url.searchParams.set("timezone", "Europe/Lisbon");
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);

  const res = await fetch(url.toString());
  if (!res.ok) return NextResponse.json({ error: "Erro ao obter dados meteorológicos" }, { status: 502 });

  const raw = await res.json();
  const weatherData = {
    location, date, coords,
    daily: raw.daily,
    hourly: raw.hourly,
    wmo_code: raw.daily?.weathercode?.[0],
    description: wmoDescription(raw.daily?.weathercode?.[0]),
  };

  // Upsert cache
  await sb.from("weather_cache").upsert({ location, lat: coords.lat, lon: coords.lon, date, data: weatherData }, { onConflict: "location,date" });

  return NextResponse.json({ weather: weatherData, fromCache: false });
}

async function geocode(location: string): Promise<{ lat: number; lon: number } | null> {
  // Quick lookup for common PT cities
  const PT: Record<string, { lat: number; lon: number }> = {
    "Lisboa": { lat: 38.7167, lon: -9.1333 },
    "Porto": { lat: 41.1495, lon: -8.6108 },
    "Braga": { lat: 41.5454, lon: -8.4265 },
    "Coimbra": { lat: 40.2033, lon: -8.4103 },
    "Faro": { lat: 37.0194, lon: -7.9322 },
    "Aveiro": { lat: 40.6443, lon: -8.6455 },
    "Évora": { lat: 38.5708, lon: -7.9050 },
    "Setúbal": { lat: 38.5244, lon: -8.8882 },
    "Funchal": { lat: 32.6669, lon: -16.9241 },
    "Ponta Delgada": { lat: 37.7412, lon: -25.6756 },
  };

  const key = Object.keys(PT).find((k) => location.toLowerCase().includes(k.toLowerCase()));
  if (key) return PT[key];

  // Fallback: nominatim geocoding (free)
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`, {
      headers: { "User-Agent": "BeyondFocusApp/1.0" },
    });
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch { /* ignore */ }
  return null;
}

function wmoDescription(code: number): string {
  const map: Record<number, string> = {
    0: "Céu limpo", 1: "Maioritariamente limpo", 2: "Parcialmente nublado", 3: "Nublado",
    45: "Neblina", 48: "Geada por neblina", 51: "Chuvisco ligeiro", 53: "Chuvisco moderado",
    55: "Chuvisco intenso", 61: "Chuva ligeira", 63: "Chuva moderada", 65: "Chuva intensa",
    71: "Neve ligeira", 73: "Neve moderada", 75: "Neve intensa", 80: "Aguaceiros ligeiros",
    81: "Aguaceiros moderados", 82: "Aguaceiros intensos", 95: "Trovoada",
    96: "Trovoada com granizo", 99: "Trovoada intensa com granizo",
  };
  return map[code] ?? "Desconhecido";
}
