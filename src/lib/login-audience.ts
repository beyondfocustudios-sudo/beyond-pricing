import type { User } from "@supabase/supabase-js";

export type LoginAudience = "team" | "client" | "collaborator";

export type AudienceMembership = {
  isTeam: boolean;
  isClient: boolean;
  isCollaborator: boolean;
};

export type AudienceDecision = {
  ok: boolean;
  message: string;
  suggestedAudience: LoginAudience;
  suggestedPath: string;
  membership: AudienceMembership;
};

export function parseAudience(value: string | null | undefined): LoginAudience | null {
  if (!value) return null;
  if (value === "team" || value === "client" || value === "collaborator") return value;
  if (value === "freelancer") return "collaborator";
  return null;
}

export function audienceLabel(audience: LoginAudience): string {
  if (audience === "team") return "Equipa Beyond";
  if (audience === "client") return "Cliente Beyond";
  return "Colaborador";
}

export function audienceLoginPath(audience: LoginAudience): string {
  if (audience === "client") return "/portal/login";
  if (audience === "collaborator") return "/login";
  return "/login";
}

export async function resolveAudienceMembership(
  supabase: {
    from: (table: string) => {
      select: (
        columns?: string,
        options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
      ) => unknown;
    };
  },
  user: User,
): Promise<AudienceMembership> {
  const metaRole = String(user.app_metadata?.role ?? "").toLowerCase();
  const teamRoles = new Set<string>();

  try {
    const teamQuery = supabase.from("team_members").select("role") as {
      eq: (column: string, value: string) => {
        limit: (count: number) => Promise<{ data: Array<{ role?: string }> | null }>;
      };
    };
    const { data } = await teamQuery.eq("user_id", user.id).limit(10);
    for (const row of data ?? []) {
      if (typeof row?.role === "string") teamRoles.add(row.role.toLowerCase());
    }
  } catch {
    // Best-effort; fall back to metadata checks.
  }

  let isClient = false;
  try {
    const clientQuery = supabase.from("client_users").select("id") as {
      eq: (column: string, value: string) => {
        limit: (count: number) => Promise<{ data: Array<{ id?: string }> | null }>;
      };
    };
    const { data } = await clientQuery.eq("user_id", user.id).limit(1);
    isClient = (data?.length ?? 0) > 0;
  } catch {
    // Keep false on query failure.
  }

  let hasCollaboratorProjectRole = false;
  try {
    const collaboratorQuery = supabase.from("project_members").select("id", { count: "exact", head: true }) as {
      eq: (column: string, value: string) => Promise<{ count: number | null; error: { message: string } | null }>;
    };
    const { count, error } = await collaboratorQuery.eq("user_id", user.id);
    if (!error) hasCollaboratorProjectRole = (count ?? 0) > 0;
  } catch {
    // Optional lookup failure; ignore.
  }

  const isTeam =
    teamRoles.has("owner")
    || teamRoles.has("admin")
    || teamRoles.has("member")
    || metaRole === "owner"
    || metaRole === "admin"
    || metaRole === "member";

  const isCollaborator =
    teamRoles.has("collaborator")
    || teamRoles.has("freelancer")
    || metaRole === "collaborator"
    || metaRole === "freelancer"
    || hasCollaboratorProjectRole;

  return { isTeam, isClient, isCollaborator };
}

export function decideAudienceAccess(
  audience: LoginAudience,
  membership: AudienceMembership,
): AudienceDecision {
  const ok =
    (audience === "team" && (membership.isTeam || membership.isCollaborator))
    || (audience === "client" && membership.isClient)
    || (audience === "collaborator" && membership.isCollaborator);

  if (ok) {
    const resolvedAudience: LoginAudience = audience === "team" && membership.isCollaborator && !membership.isTeam
      ? "collaborator"
      : audience;

    return {
      ok: true,
      message: "Acesso autorizado.",
      suggestedAudience: resolvedAudience,
      suggestedPath: resolvedAudience === "client"
        ? "/portal"
        : resolvedAudience === "collaborator"
          ? "/app/collaborator"
          : "/app/dashboard",
      membership,
    };
  }

  const suggestedAudience: LoginAudience = membership.isClient
    ? "client"
    : membership.isCollaborator
      ? "collaborator"
      : "team";

  return {
    ok: false,
    message: `Esta conta não tem acesso para ${audienceLabel(audience)}.`,
    suggestedAudience,
    suggestedPath: audienceLoginPath(suggestedAudience),
    membership,
  };
}
