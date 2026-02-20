import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const rl = rateLimit(`notif-get-${ip}`, { max: 60, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");
  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 100));

  if (unreadOnly) query = query.is("read_at", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    action?: "markRead" | "markAllRead" | "create";
    id?: string;
    // for "create"
    type?: string;
    title?: string;
    bodyText?: string;
    projectId?: string;
    targetUserId?: string;
    linkUrl?: string;
  };

  if (body.action === "markRead" && body.id) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "markAllRead") {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "create" || !body.action) {
    // Insert notification for target user
    const targetId = body.targetUserId ?? user.id;
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        user_id: targetId,
        type: body.type ?? "general",
        title: body.title ?? "Notificação",
        body: body.bodyText,
        project_id: body.projectId,
        link_url: body.linkUrl,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
