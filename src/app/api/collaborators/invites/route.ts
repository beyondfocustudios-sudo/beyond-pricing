import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { hashInviteToken, maskEmail } from "@/lib/client-invites";

type InviteRow = {
  id: string;
  email: string;
  role: "owner" | "admin" | "editor";
  expires_at: string;
  used_at: string | null;
  projects?: { project_name?: string } | Array<{ project_name?: string }> | null;
};

function parseProjectName(projects: InviteRow["projects"]) {
  if (!projects) return null;
  if (Array.isArray(projects)) return projects[0]?.project_name ?? null;
  return projects.project_name ?? null;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token em falta" }, { status: 400 });
  }

  const admin = createServiceClient();
  const tokenHash = hashInviteToken(token);
  const { data, error } = await admin
    .from("project_invites")
    .select("id, email, role, expires_at, used_at, projects:project_id(project_name)")
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
    kind: "collaborator",
    emailMasked: maskEmail(invite.email),
    role: invite.role,
    projectName: parseProjectName(invite.projects),
    expiresAt: invite.expires_at,
  });
}
