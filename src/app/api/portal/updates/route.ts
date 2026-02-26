import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectAccess } from "@/lib/authz";

type UpdateItem = {
  id: string;
  type: "message" | "review" | "delivery" | "request";
  title: string;
  body: string | null;
  author: string | null;
  created_at: string;
  status: string | null;
  milestone_id: string | null;
  href: string;
};

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  try {
    await requireProjectAccess(projectId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id")
    .eq("project_id", projectId);
  const conversationIds = (conversations ?? []).map((row) => row.id).filter(Boolean);

  const [messagesRes, requestsRes, deliveriesRes] = await Promise.all([
    conversationIds.length > 0
      ? supabase
        .from("messages")
        .select("id, conversation_id, sender_type, sender_user_id, body, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(30)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("client_requests")
      .select("id, title, body, status, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("deliverable_files")
      .select("id, project_id, name, filename, status, created_at, modified_at")
      .eq("project_id", projectId)
      .order("modified_at", { ascending: false })
      .limit(30),
  ]);

  const updates: UpdateItem[] = [];

  for (const row of (messagesRes.data ?? []) as Array<Record<string, unknown>>) {
    updates.push({
      id: `msg-${String(row.id ?? "")}`,
      type: "message",
      title: "Nova mensagem",
      body: String(row.body ?? "").slice(0, 280) || null,
      author: String(row.sender_type ?? "team"),
      created_at: String(row.created_at ?? new Date().toISOString()),
      status: null,
      milestone_id: null,
      href: `/portal/projects/${projectId}?tab=inbox&highlight=msg-${String(row.id ?? "")}`,
    });
  }

  for (const row of (requestsRes.data ?? []) as Array<Record<string, unknown>>) {
    updates.push({
      id: `req-${String(row.id ?? "")}`,
      type: "request",
      title: String(row.title ?? "Pedido"),
      body: (row.body as string | null) ?? null,
      author: "cliente",
      created_at: String(row.created_at ?? new Date().toISOString()),
      status: String(row.status ?? "open"),
      milestone_id: null,
      href: `/portal/projects/${projectId}?tab=approvals&highlight=req-${String(row.id ?? "")}`,
    });
  }

  for (const row of (deliveriesRes.data ?? []) as Array<Record<string, unknown>>) {
    const fileName = String(row.name ?? row.filename ?? "Ficheiro");
    updates.push({
      id: `file-${String(row.id ?? "")}`,
      type: "delivery",
      title: `Entrega: ${fileName}`,
      body: null,
      author: "equipa",
      created_at: String(row.modified_at ?? row.created_at ?? new Date().toISOString()),
      status: (row.status as string | null) ?? null,
      milestone_id: null,
      href: `/portal/projects/${projectId}?tab=deliveries&selected=${String(row.id ?? "")}`,
    });
  }

  updates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return NextResponse.json({ updates: updates.slice(0, 80) });
}
