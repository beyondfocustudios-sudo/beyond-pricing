import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectAccess } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const id = req.nextUrl.searchParams.get("id");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (id) {
    const { data, error } = await supabase
      .from("call_sheets")
      .select("*, call_sheet_people(*), call_sheet_schedule(*)")
      .eq("id", id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (projectId) {
    try { await requireProjectAccess(projectId); } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data, error } = await supabase
      .from("call_sheets")
      .select("id, title, shoot_date, location_name, location_address, general_call_time, notes, created_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("shoot_date", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  // All call sheets for user's projects
  const { data, error } = await supabase
    .from("call_sheets")
    .select("id, title, shoot_date, location_name, project_id, general_call_time")
    .is("deleted_at", null)
    .order("shoot_date", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    projectId?: string;
    title: string;
    shoot_date?: string;
    location_name?: string;
    location_address?: string;
    general_call_time?: string;
    notes?: string;
    people?: Array<{ name: string; role: string; department?: string; phone?: string; email?: string; call_time?: string; notes?: string }>;
    schedule?: Array<{ title: string; start_time: string; end_time?: string; department?: string; notes?: string }>;
  };

  if (body.projectId) {
    try { await requireProjectAccess(body.projectId); } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: sheet, error } = await supabase
    .from("call_sheets")
    .insert({
      project_id: body.projectId,
      created_by: user.id,
      title: body.title,
      shoot_date: body.shoot_date,
      location_name: body.location_name,
      location_address: body.location_address,
      general_call_time: body.general_call_time,
      notes: body.notes,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Insert people
  if (body.people?.length) {
    await supabase.from("call_sheet_people").insert(
      body.people.map(p => ({ call_sheet_id: sheet.id, ...p }))
    );
  }

  // Insert schedule
  if (body.schedule?.length) {
    await supabase.from("call_sheet_schedule").insert(
      body.schedule.map(s => ({ call_sheet_id: sheet.id, ...s }))
    );
  }

  return NextResponse.json(sheet, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    id: string;
    title?: string;
    shoot_date?: string;
    location_name?: string;
    location_address?: string;
    general_call_time?: string;
    notes?: string;
    weather_snapshot?: Record<string, unknown>;
    deleted_at?: string;
  };

  const { data, error } = await supabase
    .from("call_sheets")
    .update(body)
    .eq("id", body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Soft delete
  await supabase.from("call_sheets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}
