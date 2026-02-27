import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveAccessRole } from "@/lib/access-role";

export async function requireDropboxManager(requireAdmin = false) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) } as const;
  }

  const access = await resolveAccessRole(supabase, user);
  if (access.isClient) {
    return { error: NextResponse.json({ error: "Clientes não podem gerir Dropbox" }, { status: 403 }) } as const;
  }

  const role = String(access.role ?? "").toLowerCase();
  const isAdmin = role === "owner" || role === "admin";

  if (requireAdmin && !isAdmin) {
    return { error: NextResponse.json({ error: "Apenas owner/admin" }, { status: 403 }) } as const;
  }

  return {
    user,
    role,
    orgId: access.orgId,
  } as const;
}
