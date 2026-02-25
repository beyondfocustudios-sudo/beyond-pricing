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

type WeatherDay = {
  date: string;
  weather_code: number | null;
  weather_label: string;
  temp_max: number | null;
  temp_min: number | null;
  precipitation_sum: number | null;
  windspeed_max: number | null;
};

function weatherDescription(code: number): string {
  const map: Record<number, string> = {
    0: "Céu limpo",
    1: "Maioritariamente limpo",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Neblina",
    48: "Neblina com geada",
    51: "Chuvisco ligeiro",
    53: "Chuvisco moderado",
    55: "Chuvisco intenso",
    61: "Chuva ligeira",
    63: "Chuva moderada",
    65: "Chuva intensa",
    71: "Neve ligeira",
    73: "Neve moderada",
    75: "Neve intensa",
    80: "Aguaceiros ligeiros",
    81: "Aguaceiros moderados",
    82: "Aguaceiros fortes",
    95: "Trovoada",
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

function normalizeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildOpenMeteoDays(raw: z.infer<typeof openMeteoSchema>): WeatherDay[] {
  const daily = raw.daily;
  return (daily?.time ?? []).map((date, index) => ({
    date,
    weather_code: daily?.weathercode?.[index] ?? null,
    weather_label: weatherDescription(daily?.weathercode?.[index] ?? -1),
    temp_max: daily?.temperature_2m_max?.[index] ?? null,
    temp_min: daily?.temperature_2m_min?.[index] ?? null,
    precipitation_sum: daily?.precipitation_sum?.[index] ?? null,
    windspeed_max: daily?.windspeed_10m_max?.[index] ?? null,
  }));
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
  const datesParam = req.nextUrl.searchParams.get("dates");

  const requestedDates = (datesParam ?? "")
    .split(",")
    .map((item) => normalizeDate(item.trim()))
    .filter((item): item is string => Boolean(item))
    .sort((a, b) => a.localeCompare(b));

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

  const locationKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const ttlMs = ttlFromRegistry("weather") * 1000;

  const today = new Date();
  const defaultStart = today.toISOString().slice(0, 10);
  const defaultEndDate = new Date(today.getTime());
  defaultEndDate.setDate(defaultEndDate.getDate() + 7);
  const defaultEnd = defaultEndDate.toISOString().slice(0, 10);

  const startDate = requestedDates.length > 0 ? requestedDates[0] : defaultStart;
  const endDate = requestedDates.length > 0 ? requestedDates[requestedDates.length - 1] : defaultEnd;

  const cachedDayMap = new Map<string, WeatherDay>();

  if (requestedDates.length > 0) {
    const { data: cacheRows } = await supabase
      .from("weather_cache")
      .select("date, data, fetched_at")
      .eq("location", locationKey)
      .in("date", requestedDates);

    for (const row of (cacheRows ?? []) as Array<{ date: string; fetched_at?: string; data?: Record<string, unknown> }>) {
      if (!row.fetched_at || Date.now() - new Date(row.fetched_at).getTime() > ttlMs) continue;
      const day = row.data as WeatherDay | undefined;
      if (day?.date) cachedDayMap.set(day.date, day);
    }

    if (requestedDates.every((date) => cachedDayMap.has(date))) {
      await logPluginRun({ pluginKey: "weather", status: "ok", cacheHit: true, meta: { location: locationKey, mode: "dates" } });
      return NextResponse.json({
        ok: true,
        cacheHit: true,
        stale: false,
        source: "weather_cache",
        location: { lat, lng, name: locationName },
        forecast_start: startDate,
        forecast_end: endDate,
        days: requestedDates.map((date) => cachedDayMap.get(date) as WeatherDay),
      });
    }
  } else {
    const { data: cacheRows } = await supabase
      .from("weather_cache")
      .select("id, data, fetched_at")
      .eq("location", locationKey)
      .eq("date", defaultStart)
      .order("fetched_at", { ascending: false })
      .limit(1);

    const cached = cacheRows?.[0] as { data?: { days?: WeatherDay[] }; fetched_at?: string } | undefined;
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
  }

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max");
    url.searchParams.set("timezone", "Europe/Lisbon");
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);

    const response = await fetch(url.toString(), { next: { revalidate: 60 * 30 } });
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);

    const raw = await response.json().catch(() => null);
    const parsed = openMeteoSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Payload inválido de Open-Meteo");
    }

    const days = buildOpenMeteoDays(parsed.data);
    const selectedDays = requestedDates.length > 0
      ? requestedDates.map((date) => days.find((day) => day.date === date)).filter((day): day is WeatherDay => Boolean(day))
      : days;

    if (requestedDates.length > 0) {
      for (const day of selectedDays) {
        await supabase.from("weather_cache").upsert(
          {
            location: locationKey,
            lat,
            lon: lng,
            date: day.date,
            data: day,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "location,date" },
        );
      }
    } else {
      await supabase.from("weather_cache").upsert(
        {
          location: locationKey,
          lat,
          lon: lng,
          date: defaultStart,
          data: {
            forecast_start: startDate,
            forecast_end: endDate,
            days,
            fetched_at: new Date().toISOString(),
          },
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "location,date" },
      );
    }

    await logPluginRun({ pluginKey: "weather", status: "ok", cacheHit: false, meta: { location: locationKey } });

    return NextResponse.json({
      ok: true,
      cacheHit: false,
      stale: false,
      source: "open-meteo",
      location: { lat, lng, name: locationName },
      forecast_start: startDate,
      forecast_end: endDate,
      days: selectedDays,
    });
  } catch (err) {
    if (requestedDates.length > 0) {
      const { data: staleRows } = await supabase
        .from("weather_cache")
        .select("date, data")
        .eq("location", locationKey)
        .in("date", requestedDates);

      const staleMap = new Map<string, WeatherDay>();
      for (const row of (staleRows ?? []) as Array<{ date: string; data?: Record<string, unknown> }>) {
        const day = row.data as WeatherDay | undefined;
        if (day?.date) staleMap.set(day.date, day);
      }

      if (staleMap.size > 0) {
        await logPluginRun({ pluginKey: "weather", status: "ok", cacheHit: true, meta: { location: locationKey, stale: true } });
        return NextResponse.json({
          ok: true,
          cacheHit: true,
          stale: true,
          source: "weather_cache_stale",
          warning: "Dados em cache (API indisponivel)",
          location: { lat, lng, name: locationName },
          forecast_start: startDate,
          forecast_end: endDate,
          days: requestedDates.map((date) => staleMap.get(date)).filter((day): day is WeatherDay => Boolean(day)),
        });
      }
    }

    const message = err instanceof Error ? err.message : "Weather unavailable";
    await logPluginRun({ pluginKey: "weather", status: "error", cacheHit: false, error: message, meta: { location: locationKey } });

    return NextResponse.json(
      {
        error: "Nao foi possivel carregar weather. Usa override manual temporario.",
        detail: message,
      },
      { status: 502 },
    );
  }
}
