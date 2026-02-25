import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInviteToken, hashInviteToken, maskEmail } from "@/lib/client-invites";

type InviteRow = {
  id: string;
  email: string;
  role: "client_viewer" | "client_approver";
  expires_at: string;
  used_at: string | null;
  clients?: { name?: string } | Array<{ name?: string }> | null;
};

function parseClientName(clients: InviteRow["clients"]) {
  if (!clients) return null;
  if (Array.isArray(clients)) return clients[0]?.name ?? null;
  return clients.name ?? null;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token em falta" }, { status: 400 });
  }

  const admin = createServiceClient();
  const tokenHash = hashInviteToken(token);
  const { data, error } = await admin
    .from("client_invites")
    .select("id, email, role, expires_at, used_at, clients:client_id(name)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
  }

  const invite = data as InviteRow;
  if (invite.used_at) {
    return NextResponse.json({ ok: false, error: "Convite já utilizado." }, { status: 410 });
  }

  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: "Convite expirado." }, { status: 410 });
  }

  return NextResponse.json({
    ok: true,
    emailMasked: maskEmail(invite.email),
    role: invite.role,
    clientName: parseClientName(invite.clients),
    expiresAt: invite.expires_at,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: tm } = await supabase
    .from("team_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (tm?.role ?? user.app_metadata?.role ?? null) as string | null;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Apenas owner/admin podem convidar clientes." }, { status: 403 });
  }

  const body = await request.json() as {
    clientId?: string;
    email?: string;
    role?: "client_viewer" | "client_approver";
    expiresInDays?: number;
  };

  const clientId = String(body.clientId ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const inviteRole = body.role === "client_approver" ? "client_approver" : "client_viewer";
  const expiresInDays = Number.isFinite(body.expiresInDays) ? Number(body.expiresInDays) : 7;

  if (!clientId || !email) {
    return NextResponse.json({ error: "clientId e email são obrigatórios." }, { status: 400 });
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }

  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(30, expiresInDays)) * 24 * 60 * 60 * 1000).toISOString();

  const admin = createServiceClient();
  const { data: clientRow } = await admin
    .from("clients")
    .select("id, deleted_at")
    .eq("id", clientId)
    .maybeSingle();

  if (!clientRow || clientRow.deleted_at) {
    return NextResponse.json({ error: "Cliente não encontrado ou inativo." }, { status: 404 });
  }

  const { error: inviteError } = await admin.from("client_invites").insert({
    client_id: clientId,
    email,
    role: inviteRole,
    token_hash: tokenHash,
    invited_by: user.id,
    expires_at: expiresAt,
  });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  const inviteUrl = `${request.nextUrl.origin}/portal/invite?token=${token}`;

  // Optional email dispatch queue; ignore if table is absent.
  try {
    await admin.from("email_outbox").insert({
      to_email: email,
      subject: "Convite para o Portal Beyond",
      body_text: `Recebeste um convite para o portal da Beyond. Link: ${inviteUrl}`,
      metadata: { client_id: clientId, invite_role: inviteRole },
    });
  } catch {
    // No-op.
  }

  return NextResponse.json({
    ok: true,
    inviteUrl,
    expiresAt,
  });
}
