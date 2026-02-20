import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/logistics  body: { origin, destination, waypoints?, vehicleType?, projectId? }
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = rateLimit(`logistics:${ip}`, { max: 20, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as {
    origin?: string; destination?: string; waypoints?: string[];
    vehicleType?: string; projectId?: string; notes?: string;
  };

  if (!body.origin?.trim() || !body.destination?.trim()) {
    return NextResponse.json({ error: "origin e destination obrigatórios" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_DISTANCE_API_KEY;
  let distanceKm: number | null = null;
  let durationMin: number | null = null;
  let rawResponse: unknown = null;

  if (apiKey) {
    try {
      const waypoints = body.waypoints?.length
        ? `&waypoints=${encodeURIComponent(body.waypoints.join("|"))}`
        : "";
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(body.origin)}&destinations=${encodeURIComponent(body.destination)}${waypoints}&key=${apiKey}&language=pt-PT&units=metric`;
      const res = await fetch(url);
      const data = await res.json();
      rawResponse = data;
      const element = data?.rows?.[0]?.elements?.[0];
      if (element?.status === "OK") {
        distanceKm = element.distance.value / 1000;
        durationMin = element.duration.value / 60;
      }
    } catch (e) {
      console.error("Google Distance API error:", e);
    }
  }

  const { data: route, error } = await sb.from("logistics_routes").insert({
    user_id: user.id,
    project_id: body.projectId ?? null,
    origin: body.origin.trim(),
    destination: body.destination.trim(),
    waypoints: body.waypoints ?? [],
    distance_km: distanceKm,
    duration_min: durationMin,
    vehicle_type: body.vehicleType ?? null,
    notes: body.notes ?? null,
    raw_response: rawResponse,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ route, hasApiData: !!apiKey }, { status: 201 });
}

// GET /api/logistics?projectId=xxx
export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  let q = sb.from("logistics_routes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  if (projectId) q = q.eq("project_id", projectId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ routes: data });
}
