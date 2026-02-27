import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { logPluginRun } from "@/lib/plugins/runtime";
import { ttlFromRegistry } from "@/lib/plugins/registry";

type FuelType = "diesel" | "gasoline";

function parseFuelType(value: string | null): FuelType {
  return value === "gasoline" ? "gasoline" : "diesel";
}

function fallbackPrice(country: string, fuelType: FuelType) {
  if (country.toUpperCase() === "PT") {
    return fuelType === "diesel" ? 1.62 : 1.77;
  }
  return fuelType === "diesel" ? 1.65 : 1.82;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const country = (req.nextUrl.searchParams.get("country") ?? "PT").toUpperCase();
  const fuelType = parseFuelType(req.nextUrl.searchParams.get("type"));
  const fuelPriceType = fuelType === "diesel" ? "gasoleo" : "gasolina95";
  const ttlMs = ttlFromRegistry("fuel") * 1000;

  const { data: weeklyCache } = await supabase
    .from("fuel_price_cache")
    .select("price_per_l, source, updated_at")
    .eq("fuel_type", fuelPriceType)
    .maybeSingle();

  const weeklyPrice = Number((weeklyCache as { price_per_l?: unknown } | null)?.price_per_l);
  if (Number.isFinite(weeklyPrice) && weeklyPrice > 0) {
    await logPluginRun({ pluginKey: "fuel", status: "ok", cacheHit: true, meta: { country, fuelType, source: "fuel_price_cache" } });
    return NextResponse.json({
      ok: true,
      price_per_liter: weeklyPrice,
      source: String((weeklyCache as { source?: string } | null)?.source ?? "fuel_price_cache"),
      updated_at: (weeklyCache as { updated_at?: string } | null)?.updated_at ?? null,
      cacheHit: true,
      stale: false,
      country,
      fuel_type: fuelType,
      data: {},
    });
  }

  const { data: cachedRows } = await supabase
    .from("fuel_cache")
    .select("price_per_liter, source, data, fetched_at, expires_at")
    .eq("country", country)
    .eq("fuel_type", fuelType)
    .order("fetched_at", { ascending: false })
    .limit(1);

  const cached = cachedRows?.[0] as {
    price_per_liter?: number;
    source?: string;
    data?: Record<string, unknown>;
    fetched_at?: string;
    expires_at?: string;
  } | undefined;

  if (cached?.price_per_liter && cached?.expires_at && new Date(cached.expires_at).getTime() > Date.now()) {
    await logPluginRun({ pluginKey: "fuel", status: "ok", cacheHit: true, meta: { country, fuelType } });
    return NextResponse.json({
      ok: true,
      price_per_liter: cached.price_per_liter,
      source: cached.source ?? "fuel_cache",
      cacheHit: true,
      stale: false,
      country,
      fuel_type: fuelType,
      data: cached.data ?? {},
    });
  }

  try {
    let price: number | null = null;
    let source = "fallback";

    const { data: org } = await supabase
      .from("org_settings")
      .select("diesel_price_per_liter, petrol_price_per_liter")
      .limit(1)
      .maybeSingle();

    const orgPrice = fuelType === "diesel"
      ? Number(org?.diesel_price_per_liter ?? NaN)
      : Number(org?.petrol_price_per_liter ?? NaN);

    if (Number.isFinite(orgPrice) && orgPrice > 0) {
      price = orgPrice;
      source = "org_settings";
    }

    if (!price) {
      price = fallbackPrice(country, fuelType);
      source = "fallback";
    }

    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + ttlMs);

    await supabase.from("fuel_cache").upsert(
      {
        country,
        fuel_type: fuelType,
        price_per_liter: price,
        source,
        data: {
          note: source === "org_settings" ? "Preco configurado na organizacao" : "Fallback publico",
        },
        fetched_at: fetchedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "country,fuel_type" },
    );

    await logPluginRun({ pluginKey: "fuel", status: "ok", cacheHit: false, meta: { country, fuelType, source } });

    return NextResponse.json({
      ok: true,
      country,
      fuel_type: fuelType,
      price_per_liter: price,
      source,
      cacheHit: false,
      stale: false,
    });
  } catch (err) {
    if (cached?.price_per_liter && cached.fetched_at && Date.now() - new Date(cached.fetched_at).getTime() < ttlMs * 3) {
      await logPluginRun({ pluginKey: "fuel", status: "ok", cacheHit: true, meta: { country, fuelType, stale: true } });
      return NextResponse.json({
        ok: true,
        country,
        fuel_type: fuelType,
        price_per_liter: cached.price_per_liter,
        source: "fuel_cache_stale",
        cacheHit: true,
        stale: true,
        warning: "Dados em cache recente.",
      });
    }

    const message = err instanceof Error ? err.message : "fuel unavailable";
    await logPluginRun({ pluginKey: "fuel", status: "error", error: message, meta: { country, fuelType } });

    return NextResponse.json({
      ok: false,
      error: "Nao foi possivel obter preco de combustivel.",
      fallback_price: fallbackPrice(country, fuelType),
    }, { status: 502 });
  }
}
