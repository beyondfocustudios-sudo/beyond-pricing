import { createClient } from "@/lib/supabase/server";

// ── Error ─────────────────────────────────────────────────────────────────
export class AccessDeniedError extends Error {
  statusCode: 401 | 403;
  constructor(message = "Access denied", statusCode: 401 | 403 = 403) {
    super(message);
    this.name = "AccessDeniedError";
    this.statusCode = statusCode;
  }
}

// ── Role types ────────────────────────────────────────────────────────────
export type OrgRole = "owner" | "admin" | "member";
export type ProjectRole = "owner" | "admin" | "editor" | "client_viewer" | "client_approver";
export const INTERNAL_ROLES: ProjectRole[] = ["owner", "admin", "editor"];
export const ADMIN_ROLES: OrgRole[] = ["owner", "admin"];

// ── Current user ─────────────────────────────────────────────────────────
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AccessDeniedError("Not authenticated", 401);
  return user;
}

// ── Global admin (app_metadata.role) ─────────────────────────────────────
export async function isGlobalAdmin(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const role = user.app_metadata?.role as string | undefined;
    return role === "owner" || role === "admin";
  } catch {
    return false;
  }
}

export async function requireGlobalAdmin() {
  const ok = await isGlobalAdmin();
  if (!ok) throw new AccessDeniedError("Global admin required");
}

// ── Org role (team_members table) ─────────────────────────────────────────
export async function getOrgRole(): Promise<OrgRole | null> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("role")
    .eq("user_id", user.id)
    .single();
  return (data?.role as OrgRole) ?? null;
}

export async function requireOrgRole(roles: OrgRole[]) {
  const role = await getOrgRole();
  if (!role || !roles.includes(role)) {
    throw new AccessDeniedError(`Requires one of: ${roles.join(", ")}`);
  }
  return role;
}

// ── Project access ────────────────────────────────────────────────────────
export async function hasProjectRole(
  projectId: string,
  roles: ProjectRole[]
): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const supabase = await createClient();
    const { data } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();
    if (!data) return false;
    return roles.includes(data.role as ProjectRole);
  } catch {
    return false;
  }
}

export async function requireProjectAccess(projectId: string): Promise<ProjectRole> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  // Global admins always have access
  const adminOk = await isGlobalAdmin();
  if (adminOk) return "admin";
  // Check project_members
  const { data, error } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();
  if (error || !data) throw new AccessDeniedError("No project access");
  return data.role as ProjectRole;
}

// ── Client user ───────────────────────────────────────────────────────────
export async function isClientUser(projectId?: string): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const supabase = await createClient();
    if (projectId) {
      const { data } = await supabase
        .from("project_members")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .single();
      return data?.role === "client_viewer" || data?.role === "client_approver";
    }
    // Check if user exists in client_users at all
    const { data } = await supabase
      .from("client_users")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ── Audit log helper ──────────────────────────────────────────────────────
export async function logAudit(params: {
  action: string;
  tableName?: string;
  recordId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}) {
  try {
    const user = await getCurrentUser();
    const supabase = await createClient();
    await supabase.from("audit_log").insert({
      user_id: user.id,
      action: params.action,
      table_name: params.tableName,
      record_id: params.recordId,
      old_data: params.oldData,
      new_data: params.newData,
    });
  } catch {
    // Non-blocking
  }
}
