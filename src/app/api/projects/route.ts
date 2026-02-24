import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// GET /api/projects — list projects for current user's org
export async function GET() {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data, error } = await sb
    .from("projects")
    .select("id, project_name, client_id, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}
