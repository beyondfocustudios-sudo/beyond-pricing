import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/weather/forecast?lat=38.5&lng=-8.8
 * Fetch weather forecast from Open-Meteo (free, no API key required)
 *
 * Response: { daily: { date[], temp_max[], temp_min[], precipitation_sum[], weathercode[] }, ... }
 */

const cache = new Map<string, { data: unknown; exp: number }>();

export async function GET(req: NextRequest) {
  try {
    const lat = req.nextUrl.searchParams.get("lat");
    const lng = req.nextUrl.searchParams.get("lng");

    if (!lat || !lng) {
      return NextResponse.json(
        { error: "lat and lng required" },
        { status: 400 }
      );
    }

    const cacheKey = `${lat},${lng}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.exp > now) {
      return NextResponse.json(cached.data);
    }

    // Open-Meteo API: free, no key required
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat);
    url.searchParams.set("longitude", lng);
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code");
    url.searchParams.set("temperature_unit", "celsius");
    url.searchParams.set("wind_speed_unit", "kmh");
    url.searchParams.set("precipitation_unit", "mm");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "10");

    const response = await fetch(url.toString());

    if (!response.ok) {
      return NextResponse.json(
        { error: `Open-Meteo error: ${response.statusText}` },
        { status: 502 }
      );
    }

    const data = await response.json();

    // Cache for 6 hours
    cache.set(cacheKey, { data, exp: now + 6 * 60 * 60 * 1000 });

    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/weather/forecast]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
