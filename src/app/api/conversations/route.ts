import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/conversations?projectId=xxx  — get or create conversation for a project
export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });

  const { data: conv } = await sb.from("conversations").select("*").eq("project_id", projectId).maybeSingle();
  if (conv) return NextResponse.json({ conversation: conv });

  // Create one (team only)
  const { data: project } = await sb.from("projects").select("client_id").eq("id", projectId).single();
  if (!project?.client_id) return NextResponse.json({ error: "Projeto sem cliente associado" }, { status: 404 });

  const admin = adminClient();
  const { data: newConv, error } = await admin.from("conversations").insert({
    project_id: projectId,
    client_id: project.client_id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation: newConv }, { status: 201 });
}

// GET /api/conversations/list — all conversations visible to user
export async function POST(req: NextRequest) {
  void req;
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data, error } = await sb
    .from("conversations")
    .select(`
      id, project_id, client_id, created_at,
      messages(id, body, sender_type, created_at)
    `)
    .order("created_at", { referencedTable: "messages", ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversations: data });
}
