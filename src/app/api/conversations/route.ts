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

// GET /api/conversations?projectId=xxx — get or create conversation for a project
export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });

  const { data: conv } = await sb.from("conversations").select("*").eq("project_id", projectId).maybeSingle();
  if (conv) return NextResponse.json({ conversation: conv });

  // Create one — project must have a client associated
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

// POST /api/conversations — list all conversations for current user
export async function POST(req: NextRequest) {
  void req;
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data, error } = await sb
    .from("conversations")
    .select(`
      id, project_id, client_id, created_at,
      projects(project_name),
      clients(name),
      messages(id, body, sender_type, created_at, sender_user_id)
    `)
    .order("created_at", { referencedTable: "messages", ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get read message IDs for this user
  const allMsgIds = (data ?? []).flatMap((c) =>
    ((c.messages ?? []) as Array<{ id: string }>).map((m) => m.id)
  );

  let readIds = new Set<string>();
  if (allMsgIds.length > 0) {
    const { data: reads } = await sb
      .from("message_reads")
      .select("message_id")
      .eq("user_id", user.id)
      .in("message_id", allMsgIds);
    readIds = new Set((reads ?? []).map((r) => r.message_id));
  }

  type RawConv = {
    id: string;
    project_id: string;
    client_id: string;
    created_at: string;
    projects: { project_name?: string } | null;
    clients: { name?: string } | null;
    messages: Array<{ id: string; body: string; sender_type: string; created_at: string; sender_user_id: string | null }>;
  };

  const conversations = (data as unknown as RawConv[] ?? []).map((c) => {
    const msgs = (c.messages ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const unread = msgs.filter((m) => !readIds.has(m.id) && m.sender_user_id !== user.id).length;
    const last = msgs[0];
    return {
      id: c.id,
      project_id: c.project_id,
      client_id: c.client_id,
      created_at: c.created_at,
      updated_at: last?.created_at ?? c.created_at,
      project_name: c.projects?.project_name ?? null,
      client_name: c.clients?.name ?? null,
      last_message: last?.body ?? null,
      unread_count: unread,
    };
  }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return NextResponse.json({ conversations });
}
