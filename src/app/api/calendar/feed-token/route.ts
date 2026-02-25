import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

function generateToken() {
  return randomBytes(24).toString("hex");
}

export async function GET(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const calendarId = request.nextUrl.searchParams.get("calendarId");

  let query = sb
    .from("calendar_feed_tokens")
    .select("id, token, calendar_id, revoked_at, created_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (calendarId) query = query.eq("calendar_id", calendarId);

  const { data: existing } = await query.maybeSingle();

  if (existing?.token) {
    return NextResponse.json({ ok: true, token: existing.token, calendarId: existing.calendar_id ?? null });
  }

  const token = generateToken();
  const { data, error } = await sb
    .from("calendar_feed_tokens")
    .insert({ user_id: user.id, calendar_id: calendarId ?? null, token })
    .select("token, calendar_id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Falha a criar token" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token: data.token, calendarId: data.calendar_id ?? null });
}

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "rotate" | "revoke";
    calendarId?: string | null;
  };

  const action = body.action ?? "rotate";
  const calendarId = body.calendarId ?? null;

  let revokeQuery = sb
    .from("calendar_feed_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("revoked_at", null);

  if (calendarId) revokeQuery = revokeQuery.eq("calendar_id", calendarId);

  await revokeQuery;

  if (action === "revoke") {
    return NextResponse.json({ ok: true, revoked: true });
  }

  const token = generateToken();
  const { data, error } = await sb
    .from("calendar_feed_tokens")
    .insert({ user_id: user.id, calendar_id: calendarId, token })
    .select("token, calendar_id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Falha a rodar token" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token: data.token, calendarId: data.calendar_id ?? null });
}
