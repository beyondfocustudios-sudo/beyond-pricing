import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectAccess } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  try { await requireProjectAccess(projectId); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const baseQuery = supabase
    .from("client_requests")
    .select("id, project_id, title, body, status, type, priority, created_at, requester_user_id, assigned_to, internal_notes")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  let { data, error } = await baseQuery.is("deleted_at", null);
  if (error && /deleted_at/i.test(error.message)) {
    ({ data, error } = await baseQuery);
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalized = (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      id: String(record.id ?? ""),
      project_id: String(record.project_id ?? projectId),
      title: String(record.title ?? ""),
      description: (record.body as string | null) ?? null,
      status: String(record.status ?? "open"),
      type: String(record.type ?? "other"),
      priority: String(record.priority ?? "medium"),
      created_at: String(record.created_at ?? new Date().toISOString()),
    };
  });

  return NextResponse.json(normalized);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    projectId: string;
    title: string;
    description?: string;
    type?: string;
    priority?: string;
    deadline?: string;
  };

  try { await requireProjectAccess(body.projectId); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .select("client_id")
    .eq("id", body.projectId)
    .maybeSingle();
  if (projectError || !projectRow?.client_id) {
    return NextResponse.json({ error: "Projeto sem cliente associado" }, { status: 400 });
  }

  const requestType = body.type && ["revision", "new_deliverable", "question", "other"].includes(body.type)
    ? body.type
    : "other";

  const { data, error } = await supabase
    .from("client_requests")
    .insert({
      project_id: body.projectId,
      client_id: projectRow.client_id,
      requester_user_id: user.id,
      title: body.title,
      body: body.description ?? null,
      type: requestType,
      priority: body.priority ?? "medium",
      deadline: body.deadline,
      status: "open",
    })
    .select("id, project_id, title, body, status, type, priority, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const record = (data ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    id: String(record.id ?? ""),
    project_id: String(record.project_id ?? body.projectId),
    title: String(record.title ?? body.title),
    description: (record.body as string | null) ?? null,
    status: String(record.status ?? "open"),
    type: String(record.type ?? requestType),
    priority: String(record.priority ?? (body.priority ?? "medium")),
    created_at: String(record.created_at ?? new Date().toISOString()),
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as { id: string; projectId: string; status?: string; assigned_to?: string; internal_notes?: string };
  try { await requireProjectAccess(body.projectId); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_requests")
    .update({ status: body.status, assigned_to: body.assigned_to, internal_notes: body.internal_notes })
    .eq("id", body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
