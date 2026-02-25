import type { SupabaseClient, User } from "@supabase/supabase-js";

export type SupportAudience = "team" | "client" | "collaborator" | "unknown";

export type SupportAccess = {
  orgId: string | null;
  isAdmin: boolean;
  role: string | null;
  audience: SupportAudience;
};

export async function resolveSupportAccess(supabase: SupabaseClient, user: User): Promise<SupportAccess> {
  let role: string | null = null;
  let orgId: string | null = null;

  const { data: teamRow } = await supabase
    .from("team_members")
    .select("role, org_id")
    .eq("user_id", user.id)
    .maybeSingle();

  role = typeof teamRow?.role === "string" ? teamRow.role : null;
  orgId = (teamRow?.org_id as string | null) ?? null;

  const isAdmin = role === "owner" || role === "admin";
  if (role === "owner" || role === "admin" || role === "member") {
    return {
      orgId,
      isAdmin,
      role,
      audience: "team",
    };
  }

  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (clientUser?.client_id) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("org_id")
      .eq("id", clientUser.client_id)
      .maybeSingle();

    return {
      orgId: (clientRow?.org_id as string | null) ?? orgId,
      isAdmin: false,
      role,
      audience: "client",
    };
  }

  const { count } = await supabase
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) > 0) {
    return {
      orgId,
      isAdmin: false,
      role,
      audience: "collaborator",
    };
  }

  if (!orgId) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .maybeSingle();
    orgId = (org?.id as string | null) ?? null;
  }

  return {
    orgId,
    isAdmin: false,
    role,
    audience: "unknown",
  };
}

export function makeSupportTitle(message: string, route: string) {
  const clean = message.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!clean) return `Problema em ${route || "rota desconhecida"}`;
  return clean;
}
