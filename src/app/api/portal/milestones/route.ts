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
    .from("project_milestones")
    .select("*")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("due_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { projectId: string; title: string; phase?: string; due_date?: string; description?: string };
  try { await requireProjectAccess(body.projectId); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_milestones")
    .insert({
      project_id: body.projectId,
      title: body.title,
      phase: body.phase ?? "pre_producao",
      due_date: body.due_date,
      description: body.description,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as { id: string; projectId: string; status?: string; progress_percent?: number; completed_at?: string };
  try { await requireProjectAccess(body.projectId); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_milestones")
    .update({
      status: body.status,
      progress_percent: body.progress_percent,
      completed_at: body.completed_at,
    })
    .eq("id", body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
