import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// GET /api/conversations/[id] — fetch conversation with messages
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: conv, error } = await sb
    .from("conversations")
    .select(`
      id, project_id, client_id, created_at,
      projects(project_name),
      clients(name),
      messages(id, body, sender_type, sender_user_id, created_at)
    `)
    .eq("id", id)
    .order("created_at", { referencedTable: "messages", ascending: true })
    .single();

  if (error || !conv) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Map sender_type → from for frontend compatibility
  const messages = ((conv.messages ?? []) as Array<{
    id: string; body: string; sender_type: string;
    sender_user_id: string | null; created_at: string;
  }>).map((m) => ({
    id: m.id,
    body: m.body,
    from: m.sender_type as "team" | "client",
    sender_user_id: m.sender_user_id,
    created_at: m.created_at,
    read: false,
  }));

  const projects = conv.projects as { project_name?: string } | null;
  const clients = conv.clients as { name?: string } | null;

  return NextResponse.json({
    id: conv.id,
    project_id: conv.project_id,
    client_id: conv.client_id,
    created_at: conv.created_at,
    project_name: projects?.project_name ?? null,
    client_name: clients?.name ?? null,
    messages,
    unread_count: 0,
    updated_at: conv.created_at,
  });
}
