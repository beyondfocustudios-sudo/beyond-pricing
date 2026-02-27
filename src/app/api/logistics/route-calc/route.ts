import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveProjectManageAccess } from "@/lib/project-access";

const MAX_WAYPOINTS = 12;

const payloadSchema = z.object({
  projectId: z.string().uuid().optional(),
  baseText: z.string().min(2),
  waypoints: z.array(z.string().min(2)).min(1).max(MAX_WAYPOINTS),
  roundtrip: z.boolean().default(true),
  fuelPricePerL: z.number().positive().optional(),
  costPerKmFallback: z.number().nonnegative().optional(),
  tollsEstimate: z.number().nonnegative().optional(),
});

type GeoPoint = { lat: number; lng: number; label: string };

function haversineKm(a: GeoPoint, b: GeoPoint) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function geocodeAddress(value: string): Promise<GeoPoint | null> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=1&countrycodes=pt`,
    {
      headers: {
        "User-Agent": "BeyondFocus/1.0 (beyond@beyondfocus.pt)",
        "Accept-Language": "pt",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) return null;
  const data = (await response.json().catch(() => [])) as Array<{ lat?: string; lon?: string; display_name?: string }>;
  const first = data[0];
  if (!first?.lat || !first?.lon) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    label: first.display_name ?? value,
  };
}

async function resolveFuelPrice(admin: ReturnType<typeof createServiceClient>, manualPrice?: number) {
  if (manualPrice && manualPrice > 0) {
    return { fuelPricePerL: manualPrice, source: "manual" as const };
  }

  const { data: direct } = await admin
    .from("fuel_price_cache")
    .select("price_per_l, source, updated_at")
    .eq("fuel_type", "gasoleo")
    .maybeSingle();

  const directPrice = Number((direct as { price_per_l?: unknown } | null)?.price_per_l);
  if (Number.isFinite(directPrice) && directPrice > 0) {
    return { fuelPricePerL: directPrice, source: "fuel_price_cache" as const };
  }

  const { data: pluginCache } = await admin
    .from("fuel_cache")
    .select("price_per_liter, source")
    .eq("country", "PT")
    .eq("fuel_type", "diesel")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pluginPrice = Number((pluginCache as { price_per_liter?: unknown } | null)?.price_per_liter);
  if (Number.isFinite(pluginPrice) && pluginPrice > 0) {
    return { fuelPricePerL: pluginPrice, source: "fuel_cache" as const };
  }

  const { data: org } = await admin
    .from("org_settings")
    .select("diesel_price_per_liter")
    .limit(1)
    .maybeSingle();

  const orgPrice = Number((org as { diesel_price_per_liter?: unknown } | null)?.diesel_price_per_liter);
  if (Number.isFinite(orgPrice) && orgPrice > 0) {
    return { fuelPricePerL: orgPrice, source: "org_settings" as const };
  }

  return { fuelPricePerL: 1.62, source: "fallback" as const };
}

async function resolveConsumption(admin: ReturnType<typeof createServiceClient>) {
  const { data: org } = await admin
    .from("org_settings")
    .select("avg_fuel_consumption_l_per_100km")
    .limit(1)
    .maybeSingle();

  const value = Number((org as { avg_fuel_consumption_l_per_100km?: unknown } | null)?.avg_fuel_consumption_l_per_100km);
  if (Number.isFinite(value) && value > 0) return value;
  return 7.5;
}

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", details: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;

  if (payload.projectId) {
    const access = await resolveProjectManageAccess(payload.projectId, user.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.reason === "not_found" ? "Projeto não encontrado" : "Sem permissão" }, { status: access.reason === "not_found" ? 404 : 403 });
    }
  }

  const admin = createServiceClient();

  const places = [payload.baseText, ...payload.waypoints];
  const geocoded = await Promise.all(places.map((place) => geocodeAddress(place)));

  const unresolved = geocoded
    .map((point, index) => ({ point, name: places[index] }))
    .filter((row) => !row.point)
    .map((row) => row.name);

  if (unresolved.length > 0) {
    return NextResponse.json(
      {
        error: "Não foi possível geocodificar todos os pontos",
        unresolved,
      },
      { status: 400 },
    );
  }

  const points = geocoded as GeoPoint[];
  const sequence = payload.roundtrip ? [...points, points[0]] : points;

  let kmTotal = 0;
  let durationTotalMin = 0;
  let source = "osrm";

  try {
    const coords = sequence.map((point) => `${point.lng},${point.lat}`).join(";");
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;
    const res = await fetch(osrmUrl, { signal: AbortSignal.timeout(12_000) });

    if (!res.ok) {
      throw new Error(`OSRM ${res.status}`);
    }

    const data = (await res.json().catch(() => null)) as { routes?: Array<{ distance?: number; duration?: number }> } | null;
    const route = data?.routes?.[0];

    if (!route?.distance || !route?.duration) {
      throw new Error("OSRM sem rota válida");
    }

    kmTotal = Math.round((route.distance / 1000) * 10) / 10;
    durationTotalMin = Math.round(route.duration / 60);
  } catch {
    source = "haversine";
    for (let i = 0; i < sequence.length - 1; i += 1) {
      const segmentKm = haversineKm(sequence[i], sequence[i + 1]) * 1.25;
      kmTotal += segmentKm;
      durationTotalMin += (segmentKm / 65) * 60;
    }
    kmTotal = Math.round(kmTotal * 10) / 10;
    durationTotalMin = Math.round(durationTotalMin);
  }

  const { fuelPricePerL, source: fuelSource } = await resolveFuelPrice(admin, payload.fuelPricePerL);
  const consumptionPer100 = await resolveConsumption(admin);
  const liters = Math.round(((kmTotal / 100) * consumptionPer100) * 100) / 100;

  const baseFuelCost = liters * fuelPricePerL;
  const kmFallbackCost = payload.costPerKmFallback && payload.costPerKmFallback > 0
    ? kmTotal * payload.costPerKmFallback
    : 0;
  const tollsEstimate = payload.tollsEstimate ?? 0;
  const fuelCostEstimate = Math.round((Math.max(baseFuelCost, kmFallbackCost) + tollsEstimate) * 100) / 100;

  if (payload.projectId) {
    const { data: existing } = await admin
      .from("logistics_routes")
      .select("id")
      .eq("project_id", payload.projectId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = {
      user_id: user.id,
      project_id: payload.projectId,
      base_text: payload.baseText,
      origin: payload.baseText,
      destination: payload.waypoints[payload.waypoints.length - 1],
      waypoints: payload.waypoints,
      roundtrip: payload.roundtrip,
      km_total: kmTotal,
      distance_km: kmTotal,
      duration_total_min: durationTotalMin,
      duration_min: durationTotalMin,
      fuel_cost_estimate: fuelCostEstimate,
      fuel_cost: fuelCostEstimate,
      fuel_liters: liters,
      fuel_price_per_l: fuelPricePerL,
      fuel_price_per_liter: fuelPricePerL,
      cost_per_km_fallback: payload.costPerKmFallback ?? null,
      tolls_estimate: tollsEstimate,
      raw_response: {
        points: sequence,
        source,
        fuel_source: fuelSource,
        consumption_per_100km: consumptionPer100,
      },
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      await admin.from("logistics_routes").update(row).eq("id", existing.id);
    } else {
      await admin.from("logistics_routes").insert(row);
    }
  }

  return NextResponse.json({
    ok: true,
    source,
    fuel_source: fuelSource,
    base_text: payload.baseText,
    waypoints: payload.waypoints,
    roundtrip: payload.roundtrip,
    km_total: kmTotal,
    duration_total_min: durationTotalMin,
    fuel_liters: liters,
    fuel_price_per_l: fuelPricePerL,
    fuel_cost_estimate: fuelCostEstimate,
    tolls_estimate: tollsEstimate,
    cost_per_km_fallback: payload.costPerKmFallback ?? null,
  });
}
