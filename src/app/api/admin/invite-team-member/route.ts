import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInviteToken, hashInviteToken } from "@/lib/client-invites";

const ALLOWED_ROLES = new Set(["owner", "admin", "member", "collaborator"]);

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const admin = createServiceClient();
  const { data: actorRoleRow } = await admin.from("team_members").select("role").eq("user_id", user.id).maybeSingle();
  const actorRole = String((actorRoleRow as { role?: string } | null)?.role ?? "").toLowerCase();

  if (actorRole !== "owner" && actorRole !== "admin") {
    return NextResponse.json({ error: "Apenas owner/admin podem convidar" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    role?: string;
    project_id?: string;
  };

  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "collaborator").trim().toLowerCase();
  const projectId = body.project_id ? String(body.project_id) : null;

  if (!isEmail(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "Role inválida" }, { status: 400 });
  }

  const usersPage = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingUser = usersPage.data?.users?.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;

  let invitedUserId = existingUser?.id ?? null;

  if (!existingUser) {
    const inviteRes = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${request.nextUrl.origin}/portal/invite`,
      data: {
        role,
      },
    });

    if (inviteRes.error) {
      return NextResponse.json({ error: inviteRes.error.message }, { status: 500 });
    }

    invitedUserId = inviteRes.data.user?.id ?? null;
  }

  if (invitedUserId) {
    await admin
      .from("team_members")
      .upsert(
        {
          user_id: invitedUserId,
          role: role === "collaborator" ? "member" : role,
          invited_by: user.id,
          invited_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (projectId) {
      await admin
        .from("project_members")
        .upsert(
          {
            project_id: projectId,
            user_id: invitedUserId,
            role: role === "owner" || role === "admin" ? role : "editor",
          },
          { onConflict: "project_id,user_id" },
        );
    }
  }

  let inviteUrl: string | null = null;

  if (projectId) {
    const token = createInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: inviteError } = await admin.from("project_invites").insert({
      project_id: projectId,
      email,
      role: role === "owner" || role === "admin" ? role : "editor",
      token_hash: tokenHash,
      invited_by: user.id,
      expires_at: expiresAt,
    });

    if (!inviteError) {
      inviteUrl = `${request.nextUrl.origin}/portal/invite?token=${token}`;
    }
  }

  try {
    await admin.from("email_outbox").insert({
      to_email: email,
      subject: "Convite Beyond",
      body_text: inviteUrl
        ? `Recebeste um convite Beyond. Define password e entra pelo link: ${inviteUrl}`
        : "Recebeste um convite Beyond. Verifica o teu email para concluir o acesso.",
      metadata: {
        role,
        project_id: projectId,
        invited_by: user.id,
      },
    });
  } catch {
    // optional queue table
  }

  return NextResponse.json({
    ok: true,
    invitedUserId,
    existingUser: Boolean(existingUser),
    inviteUrl,
  });
}
