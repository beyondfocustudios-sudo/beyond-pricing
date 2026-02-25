import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";

type FuelRecord = {
  fuel_type: "gasoleo" | "gasolina95";
  price_per_l: number;
  source: string;
  updated_at: string;
  manual_override?: boolean;
};

function fallbackFuelPrice(type: FuelRecord["fuel_type"]) {
  return type === "gasoleo" ? 1.62 : 1.77;
}

async function fetchTeamRole(userId: string) {
  const admin = createServiceClient();
  const { data } = await admin.from("team_members").select("role").eq("user_id", userId).maybeSingle();
  return String((data as { role?: string } | null)?.role ?? "").toLowerCase();
}

async function canRunCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const bearer = request.headers.get("authorization") ?? "";
  return bearer === `Bearer ${cronSecret}`;
}

async function resolvePrice(admin: ReturnType<typeof createServiceClient>, fuelType: FuelRecord["fuel_type"]) {
  const pluginFuelType = fuelType === "gasoleo" ? "diesel" : "gasoline";

  const { data: pluginRow } = await admin
    .from("fuel_cache")
    .select("price_per_liter, source, fetched_at")
    .eq("country", "PT")
    .eq("fuel_type", pluginFuelType)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pluginPrice = Number((pluginRow as { price_per_liter?: unknown } | null)?.price_per_liter);
  if (Number.isFinite(pluginPrice) && pluginPrice > 0) {
    return {
      fuel_type: fuelType,
      price_per_l: pluginPrice,
      source: String((pluginRow as { source?: string } | null)?.source ?? "fuel_cache"),
      updated_at: new Date().toISOString(),
    } satisfies FuelRecord;
  }

  const { data: org } = await admin
    .from("org_settings")
    .select("diesel_price_per_liter, petrol_price_per_liter")
    .limit(1)
    .maybeSingle();

  const orgPrice = fuelType === "gasoleo"
    ? Number((org as { diesel_price_per_liter?: unknown } | null)?.diesel_price_per_liter)
    : Number((org as { petrol_price_per_liter?: unknown } | null)?.petrol_price_per_liter);

  if (Number.isFinite(orgPrice) && orgPrice > 0) {
    return {
      fuel_type: fuelType,
      price_per_l: orgPrice,
      source: "org_settings",
      updated_at: new Date().toISOString(),
    } satisfies FuelRecord;
  }

  return {
    fuel_type: fuelType,
    price_per_l: fallbackFuelPrice(fuelType),
    source: "fallback",
    updated_at: new Date().toISOString(),
  } satisfies FuelRecord;
}

async function runRefresh(force = false) {
  const admin = createServiceClient();

  const { data: existingRows } = await admin
    .from("fuel_price_cache")
    .select("fuel_type, updated_at, manual_override");

  const existingMap = new Map<string, { updated_at?: string; manual_override?: boolean }>();
  for (const row of (existingRows ?? []) as Array<{ fuel_type: string; updated_at?: string; manual_override?: boolean }>) {
    existingMap.set(row.fuel_type, row);
  }

  const output: FuelRecord[] = [];

  for (const fuelType of ["gasoleo", "gasolina95"] as const) {
    const existing = existingMap.get(fuelType);
    const freshEnough = existing?.updated_at
      ? Date.now() - new Date(existing.updated_at).getTime() < 6 * 24 * 60 * 60 * 1000
      : false;

    if (!force && freshEnough && existing?.manual_override) {
      const { data } = await admin
        .from("fuel_price_cache")
        .select("fuel_type, price_per_l, source, updated_at, manual_override")
        .eq("fuel_type", fuelType)
        .maybeSingle();
      if (data) {
        output.push(data as FuelRecord);
      }
      continue;
    }

    const resolved = await resolvePrice(admin, fuelType);
    const { data: upserted } = await admin
      .from("fuel_price_cache")
      .upsert(resolved, { onConflict: "fuel_type" })
      .select("fuel_type, price_per_l, source, updated_at, manual_override")
      .single();

    output.push((upserted as FuelRecord | null) ?? resolved);
  }

  return output;
}

export async function GET(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const isCron = await canRunCron(request);

  if (!user && !isCron) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (user) {
    const role = await fetchTeamRole(user.id);
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Apenas owner/admin" }, { status: 403 });
    }
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  const rows = await runRefresh(force);

  return NextResponse.json({ ok: true, updated: rows.length, rows });
}

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const role = await fetchTeamRole(user.id);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Apenas owner/admin" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    fuelType?: "gasoleo" | "gasolina95";
    pricePerL?: number;
  };

  if (body.fuelType && Number.isFinite(body.pricePerL) && Number(body.pricePerL) > 0) {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("fuel_price_cache")
      .upsert(
        {
          fuel_type: body.fuelType,
          price_per_l: Number(body.pricePerL),
          source: "manual_override",
          manual_override: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fuel_type" },
      )
      .select("fuel_type, price_per_l, source, updated_at, manual_override")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, row: data });
  }

  return GET(request);
}
