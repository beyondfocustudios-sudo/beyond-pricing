import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { defaultAppPathForRole, resolveAccessRole } from "@/lib/access-role";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  }

  const access = await resolveAccessRole(supabase, user);
  const redirectPath = access.isClient
    ? "/portal"
    : access.isCollaborator && !access.isTeam
      ? "/app/collaborator"
      : access.isTeam
        ? defaultAppPathForRole(access.role)
        : null;

  if (!redirectPath) {
    return NextResponse.json(
      {
        ok: false,
        message: "Não foi possível iniciar sessão com este e-mail.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ok: true,
    redirectPath,
    role: access.role,
    audience: access.isClient ? "client" : access.isCollaborator && !access.isTeam ? "collaborator" : "team",
  });
}
