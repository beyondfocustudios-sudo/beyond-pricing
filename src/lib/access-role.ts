import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AppAudienceRole =
  | "owner"
  | "admin"
  | "member"
  | "collaborator"
  | "client"
  | "unknown";

export type AccessResolution = {
  role: AppAudienceRole;
  orgId: string | null;
  isTeam: boolean;
  isCollaborator: boolean;
  isClient: boolean;
};

export const COLLABORATOR_ALLOWED_PREFIXES = [
  "/app/collaborator",
  "/app/projects",
  "/app/tasks",
  "/app/inbox",
  "/app/onboarding",
  "/app/preferences",
] as const;

export function isInternalTeamRole(role: string | null | undefined) {
  return role === "owner" || role === "admin" || role === "member";
}

export function defaultAppPathForRole(role: AppAudienceRole) {
  return role === "collaborator" ? "/app/collaborator" : "/app/dashboard";
}

export function isCollaboratorAllowedPath(pathname: string) {
  return COLLABORATOR_ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function resolveAccessRole(
  supabase: SupabaseClient,
  user: User,
): Promise<AccessResolution> {
  const appMetaRole = String(user.app_metadata?.role ?? "").toLowerCase();

  const { data: teamRow } = await supabase
    .from("team_members")
    .select("role, org_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const teamRole = String(teamRow?.role ?? appMetaRole).toLowerCase();
  const orgId = (teamRow?.org_id as string | null) ?? null;

  if (teamRole === "owner" || teamRole === "admin" || teamRole === "member") {
    return {
      role: teamRole as AppAudienceRole,
      orgId,
      isTeam: true,
      isCollaborator: false,
      isClient: false,
    };
  }

  if (teamRole === "collaborator" || teamRole === "freelancer") {
    return {
      role: "collaborator",
      orgId,
      isTeam: false,
      isCollaborator: true,
      isClient: false,
    };
  }

  const { data: clientUser } = await supabase
    .from("client_users")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  if ((clientUser?.length ?? 0) > 0) {
    return {
      role: "client",
      orgId,
      isTeam: false,
      isCollaborator: false,
      isClient: true,
    };
  }

  const { count: projectMemberCount } = await supabase
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((projectMemberCount ?? 0) > 0) {
    return {
      role: "collaborator",
      orgId,
      isTeam: false,
      isCollaborator: true,
      isClient: false,
    };
  }

  return {
    role: "unknown",
    orgId,
    isTeam: false,
    isCollaborator: false,
    isClient: false,
  };
}
