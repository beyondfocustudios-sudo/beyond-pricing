import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stage = req.nextUrl.searchParams.get("stage");
  let query = supabase
    .from("crm_deals")
    .select("*, contact:contact_id(name, email), company:company_id(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (stage) query = query.eq("stage", stage);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    title: string;
    stage?: string;
    value?: number;
    probability?: number;
    contact_id?: string;
    company_id?: string;
    project_id?: string;
    notes?: string;
    expected_close?: string;
  };

  const { data, error } = await supabase
    .from("crm_deals")
    .insert({ user_id: user.id, ...body })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { id: string; stage?: string; value?: number; probability?: number; notes?: string; lost_reason?: string; closed_at?: string; deleted_at?: string };
  const { id, ...updates } = body;

  const { data, error } = await supabase
    .from("crm_deals")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
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

  await supabase.from("crm_deals").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
