import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createInviteToken, hashInviteToken } from "@/lib/client-invites";
import { resolveProjectManageAccess } from "@/lib/project-access";

type InviteRole = "editor" | "admin" | "owner";

function isInviteRole(value: string): value is InviteRole {
  return value === "editor" || value === "admin" || value === "owner";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  if (!projectId) {
    return NextResponse.json({ error: "Project ID obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const access = await resolveProjectManageAccess(projectId, user.id);
  if (!access.ok) {
    if (access.reason === "not_found") {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    role?: string;
    expiresInDays?: number;
  };

  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "editor").trim().toLowerCase();
  const inviteRole: InviteRole = isInviteRole(role) ? role : "editor";
  const expiresInDays = Math.max(1, Math.min(30, Number(body.expiresInDays ?? 7)));

  if (!email) {
    return NextResponse.json({ error: "Email obrigatório" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: invite, error: inviteError } = await access.admin
    .from("project_invites")
    .insert({
      project_id: projectId,
      email,
      role: inviteRole,
      token_hash: tokenHash,
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select("id, project_id, email, role, expires_at")
    .single();

  if (inviteError || !invite) {
    return NextResponse.json({ error: inviteError?.message ?? "Falha ao criar convite" }, { status: 500 });
  }

  const inviteUrl = `${request.nextUrl.origin}/portal/invite?token=${token}`;

  try {
    await access.admin.from("email_outbox").insert({
      to_email: email,
      subject: "Convite para colaborar no projeto",
      body_text: `Recebeste um convite para colaborar num projeto Beyond. Link: ${inviteUrl}`,
      metadata: {
        project_id: projectId,
        invite_role: inviteRole,
      },
    });
  } catch {
    // Optional queue table.
  }

  return NextResponse.json({
    ok: true,
    inviteUrl,
    expiresAt,
    invite,
  });
}
