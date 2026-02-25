import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

function isMissingDeletedAt(error: { code?: string } | null) {
  return error?.code === "42703";
}

// GET /api/tasks?projectId=xxx&status=todo
export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  const status = req.nextUrl.searchParams.get("status");
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 120);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 300) : 120;

  let query = sb
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("position")
    .order("created_at")
    .limit(limit);
  if (projectId) query = query.eq("project_id", projectId);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);

  let { data, error } = await query;
  if (isMissingDeletedAt(error)) {
    let fallback = sb.from("tasks").select("*").eq("user_id", user.id).order("position").order("created_at").limit(limit);
    if (projectId) fallback = fallback.eq("project_id", projectId);
    if (status) fallback = fallback.eq("status", status);
    if (q) fallback = fallback.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    ({ data, error } = await fallback);
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data ?? [] });
}

// POST /api/tasks
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = rateLimit(`tasks:${ip}`, { max: 30, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  if (!body.title) return NextResponse.json({ error: "title obrigatório" }, { status: 400 });

  const { data, error } = await sb.from("tasks").insert({
    user_id: user.id,
    project_id: body.project_id ?? null,
    title: body.title,
    description: body.description ?? null,
    status: body.status ?? "todo",
    priority: body.priority ?? "medium",
    due_date: body.due_date ?? null,
    tags: body.tags ?? [],
    position: body.position ?? 0,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data }, { status: 201 });
}

// PUT /api/tasks?id=xxx
export async function PUT(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const body = await req.json() as Record<string, unknown>;
  const { data, error } = await sb.from("tasks").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

// DELETE /api/tasks?id=xxx
export async function DELETE(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  let { error } = await sb
    .from("tasks")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (isMissingDeletedAt(error)) {
    ({ error } = await sb.from("tasks").delete().eq("id", id).eq("user_id", user.id));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH /api/tasks (body must include id)
export async function PATCH(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const id = (body.id as string) ?? req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const updates = { ...body };
  delete updates.id;
  const { data, error } = await sb
    .from("tasks")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}
