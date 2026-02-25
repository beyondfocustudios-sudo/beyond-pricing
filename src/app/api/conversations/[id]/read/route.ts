import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// POST /api/conversations/[id]/read — mark all messages as read
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Get all message IDs for this conversation
  const { data: msgs } = await sb
    .from("messages")
    .select("id")
    .eq("conversation_id", id);

  if (!msgs?.length) return NextResponse.json({ ok: true });

  const rows = msgs.map((m) => ({ message_id: m.id, user_id: user.id }));
  await sb.from("message_reads").upsert(rows, { onConflict: "message_id,user_id" });

  return NextResponse.json({ ok: true, marked: rows.length });
}
