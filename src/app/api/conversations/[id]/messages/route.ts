import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// POST /api/conversations/[id]/messages — send a message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as { body: string; from?: "team" | "client" };
  if (!body.body?.trim()) return NextResponse.json({ error: "body obrigatório" }, { status: 400 });

  const senderType = body.from ?? "team";

  const { data: msg, error } = await sb
    .from("messages")
    .insert({
      conversation_id: id,
      sender_type: senderType,
      sender_user_id: user.id,
      body: body.body.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return with frontend-compatible shape
  return NextResponse.json({
    id: msg.id,
    body: msg.body,
    from: msg.sender_type as "team" | "client",
    sender_user_id: msg.sender_user_id,
    created_at: msg.created_at,
    read: false,
  }, { status: 201 });
}
