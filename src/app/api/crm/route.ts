import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// GET /api/crm?search=xxx&tag=xxx&limit=50
export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const search = req.nextUrl.searchParams.get("search");
  const tag = req.nextUrl.searchParams.get("tag");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50"), 200);

  let q = sb.from("crm_contacts").select("*").eq("owner_user_id", user.id).order("name").limit(limit);
  if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
  if (tag) q = q.contains("tags", [tag]);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data });
}

// POST /api/crm
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = rateLimit(`crm-write:${ip}`, { max: 30, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  if (!body.name) return NextResponse.json({ error: "name obrigatório" }, { status: 400 });

  const { data, error } = await sb.from("crm_contacts").insert({
    owner_user_id: user.id,
    name: body.name,
    email: body.email ?? null,
    phone: body.phone ?? null,
    company: body.company ?? null,
    notes: body.notes ?? null,
    tags: body.tags ?? [],
    source: body.source ?? null,
    custom: body.custom ?? {},
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data }, { status: 201 });
}

// PUT /api/crm?id=xxx
export async function PUT(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const body = await req.json() as Record<string, unknown>;
  const { data, error } = await sb.from("crm_contacts").update(body).eq("id", id).eq("owner_user_id", user.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}

// DELETE /api/crm?id=xxx
export async function DELETE(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { error } = await sb.from("crm_contacts").delete().eq("id", id).eq("owner_user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
