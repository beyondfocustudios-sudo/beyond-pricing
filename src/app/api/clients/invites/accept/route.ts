import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { hashInviteToken } from "@/lib/client-invites";

type InviteDbRow = {
  id: string;
  client_id: string;
  email: string;
  role: "client_viewer" | "client_approver";
  expires_at: string;
  used_at: string | null;
};

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    token?: string;
    password?: string;
    fullName?: string;
  };

  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim();

  if (!token || !password) {
    return NextResponse.json({ error: "Token e password são obrigatórios." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "A password deve ter pelo menos 8 caracteres." }, { status: 400 });
  }

  const admin = createServiceClient();
  const tokenHash = hashInviteToken(token);

  const { data, error } = await admin
    .from("client_invites")
    .select("id, client_id, email, role, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Convite inválido." }, { status: 404 });
  }

  const invite = data as InviteDbRow;
  if (invite.used_at) {
    return NextResponse.json({ error: "Convite já utilizado." }, { status: 410 });
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Convite expirado." }, { status: 410 });
  }

  const created = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (created.error || !created.data.user) {
    if (created.error?.message?.toLowerCase().includes("already")) {
      return NextResponse.json(
        { error: "Já existe conta para este email. Usa o login do portal." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: created.error?.message ?? "Falha ao criar conta." }, { status: 400 });
  }

  const userId = created.data.user.id;

  const { error: linkError } = await admin
    .from("client_users")
    .upsert(
      {
        client_id: invite.client_id,
        user_id: userId,
        role: invite.role,
      },
      { onConflict: "client_id,user_id" },
    );

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  await admin
    .from("client_invites")
    .update({ used_at: new Date().toISOString(), used_by_user_id: userId })
    .eq("id", invite.id);

  return NextResponse.json({ ok: true, email: invite.email });
}
