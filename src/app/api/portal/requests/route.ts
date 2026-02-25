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
  const { data, error } = await supabase
    .from("client_requests")
    .select("*, requester:requester_id(email, raw_user_meta_data->full_name)")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
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

  const { data, error } = await supabase
    .from("client_requests")
    .insert({
      project_id: body.projectId,
      requester_id: user.id,
      title: body.title,
      description: body.description,
      type: body.type ?? "general",
      priority: body.priority ?? "medium",
      deadline: body.deadline,
      status: "open",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
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
