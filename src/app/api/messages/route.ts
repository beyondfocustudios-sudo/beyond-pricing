import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/messages?conversationId=xxx
export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) return NextResponse.json({ error: "conversationId obrigatório" }, { status: 400 });

  const { data, error } = await sb
    .from("messages")
    .select("id, conversation_id, sender_type, sender_user_id, body, attachments, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

// POST /api/messages  body: { conversationId, body, attachments? }
export async function POST(req: NextRequest) {
  // Rate limit: 30 messages/min per user IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = rateLimit(`msg:${ip}`, { max: 30, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as { conversationId?: string; body?: string; attachments?: unknown[] };
  if (!body.conversationId || !body.body?.trim()) {
    return NextResponse.json({ error: "conversationId e body obrigatórios" }, { status: 400 });
  }
  if (body.body.length > 5000) {
    return NextResponse.json({ error: "Mensagem demasiado longa (máx 5000 caracteres)" }, { status: 400 });
  }

  // Determine sender_type (is user a client_user for this conversation's client?)
  const { data: conv } = await sb.from("conversations").select("client_id, project_id").eq("id", body.conversationId).single();
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  const { data: clientUser } = await sb.from("client_users").select("id").eq("user_id", user.id).eq("client_id", conv.client_id).maybeSingle();
  const senderType = clientUser ? "client" : "team";

  const admin = adminClient();

  // Insert message
  const { data: msg, error: msgErr } = await admin.from("messages").insert({
    conversation_id: body.conversationId,
    sender_type: senderType,
    sender_user_id: user.id,
    body: body.body.trim(),
    attachments: body.attachments ?? [],
  }).select().single();

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // Fire notifications async (don't await to keep response fast)
  void triggerNotifications(admin, msg, conv.project_id, conv.client_id, senderType, user.id);

  return NextResponse.json({ message: msg }, { status: 201 });
}

async function triggerNotifications(
  admin: ReturnType<typeof adminClient>,
  msg: { id: string; body: string },
  projectId: string,
  clientId: string,
  senderType: "client" | "team",
  senderId: string
) {
  if (senderType === "client") {
    // Notify internal team members only (exclude client/freelancer roles)
    const { data: members } = await admin.from("project_members")
      .select("user_id, role")
      .eq("project_id", projectId)
      .in("role", ["owner", "admin", "editor", "producer"]);
    if (members?.length) {
      const notifs = members
        .filter((m) => m.user_id !== senderId)
        .map((m) => ({
          user_id: m.user_id,
          type: "new_message" as const,
          payload: { message_id: msg.id, project_id: projectId, preview: msg.body.slice(0, 100) },
        }));
      if (notifs.length) await admin.from("notifications").insert(notifs);

      // Enqueue emails
      if (process.env.RESEND_API_KEY || process.env.SMTP_HOST) {
        const emails = members.filter((m) => m.user_id !== senderId).map((m) => ({
          to_email: `team+${m.user_id}@placeholder`,
          template: "new_message",
          payload: { message_id: msg.id, project_id: projectId, sender_type: senderType },
        }));
        if (emails.length) await admin.from("email_outbox").insert(emails);
      }
    }
  } else {
    // Notify client users
    const { data: clientUsers } = await admin.from("client_users").select("user_id").eq("client_id", clientId);
    if (clientUsers?.length) {
      const notifs = clientUsers.map((cu) => ({
        user_id: cu.user_id,
        type: "new_message" as const,
        payload: { message_id: msg.id, project_id: projectId, preview: msg.body.slice(0, 100) },
      }));
      await admin.from("notifications").insert(notifs);

      if (process.env.RESEND_API_KEY || process.env.SMTP_HOST) {
        const emails = clientUsers.map((cu) => ({
          to_email: `client+${cu.user_id}@placeholder`,
          template: "new_message",
          payload: { message_id: msg.id, project_id: projectId, sender_type: senderType },
        }));
        await admin.from("email_outbox").insert(emails);
      }
    }
  }
}
