import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getAssistantSettings } from "@/lib/hq-assistant";

function apiUrl(base: string, path: string) {
  return `${base}${path}`;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { projectId?: string };
  const projectId = String(body.projectId ?? "").trim();

  if (!projectId) {
    return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const settings = await getAssistantSettings(supabase);
  if (!settings.enableHqAssistant) {
    return NextResponse.json({ error: "HQ Assistant desativado" }, { status: 403 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, location_text, location_lat, location_lng")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const locationText = String((project as Record<string, unknown>).location_text ?? "").trim();
  const lat = Number((project as Record<string, unknown>).location_lat ?? NaN);
  const lng = Number((project as Record<string, unknown>).location_lng ?? NaN);

  const weatherUrl = Number.isFinite(lat) && Number.isFinite(lng)
    ? apiUrl(origin, `/api/plugins/weather?lat=${lat}&lng=${lng}`)
    : apiUrl(origin, `/api/plugins/weather?location=${encodeURIComponent(locationText || "Setubal")}`);

  const routeUrl = apiUrl(origin, `/api/plugins/route?from=${encodeURIComponent("Setubal")}&to=${encodeURIComponent(locationText || "Lisboa")}`);
  const fuelUrl = apiUrl(origin, "/api/plugins/fuel?country=PT&type=diesel");

  const headers = {
    cookie: request.headers.get("cookie") ?? "",
  };

  const [weatherRes, routeRes, fuelRes] = await Promise.allSettled([
    fetch(weatherUrl, { headers, cache: "no-store" }),
    fetch(routeUrl, { headers, cache: "no-store" }),
    fetch(fuelUrl, { headers, cache: "no-store" }),
  ]);

  const result = {
    weather: weatherRes.status === "fulfilled" ? weatherRes.value.ok : false,
    route: routeRes.status === "fulfilled" ? routeRes.value.ok : false,
    fuel: fuelRes.status === "fulfilled" ? fuelRes.value.ok : false,
  };

  return NextResponse.json({
    ok: result.weather || result.route || result.fuel,
    result,
  });
}
