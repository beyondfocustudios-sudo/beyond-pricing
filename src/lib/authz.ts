// ============================================================
// Beyond Pricing — Authorization helpers (RBAC)
// ============================================================
// These run server-side via supabase-server (service role or
// user session) and are the single source of truth for access.
// ============================================================

import { createClient as createServerClientAsync } from "@/lib/supabase-server";

export type ProjectMemberRole =
  | "owner"
  | "admin"
  | "editor"
  | "client_viewer"
  | "client_approver";

export type ClientRole = "client_viewer" | "client_approver";

// Internal roles (staff)
export const INTERNAL_ROLES: ProjectMemberRole[] = ["owner", "admin", "editor"];
export const ADMIN_ROLES: ProjectMemberRole[] = ["owner", "admin"];

// ── hasProjectRole ────────────────────────────────────────────
// Returns true if the current authenticated user has at least
// one of the specified roles on the given project.
export async function hasProjectRole(
  projectId: string,
  roles: ProjectMemberRole[]
): Promise<boolean> {
  const sb = await createServerClientAsync();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;

  const { data } = await sb
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!data) return false;
  return roles.includes(data.role as ProjectMemberRole);
}

// ── isClientUser ─────────────────────────────────────────────
// Returns the client_user row if the current user is a client
// member for any client that owns the given project.
export async function isClientUser(projectId: string): Promise<boolean> {
  const sb = await createServerClientAsync();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;

  const { data: project } = await sb
    .from("projects")
    .select("client_id")
    .eq("id", projectId)
    .single();

  if (!project?.client_id) return false;

  const { data } = await sb
    .from("client_users")
    .select("id")
    .eq("client_id", project.client_id)
    .eq("user_id", user.id)
    .single();

  return !!data;
}

// ── requireProjectAccess ─────────────────────────────────────
// Throws a redirect-like object if the user has no access.
// Use in Server Components / Route Handlers.
// Returns the user's effective role.
export async function requireProjectAccess(
  projectId: string
): Promise<{ role: ProjectMemberRole | ClientRole; userId: string }> {
  const sb = await createServerClientAsync();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    throw new AccessDeniedError("Unauthenticated", 401);
  }

  // Check project_members first
  const { data: member } = await sb
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  if (member) {
    return { role: member.role as ProjectMemberRole, userId: user.id };
  }

  // Check client access
  const { data: project } = await sb
    .from("projects")
    .select("client_id")
    .eq("id", projectId)
    .single();

  if (project?.client_id) {
    const { data: clientUser } = await sb
      .from("client_users")
      .select("role")
      .eq("client_id", project.client_id)
      .eq("user_id", user.id)
      .single();

    if (clientUser) {
      return { role: clientUser.role as ClientRole, userId: user.id };
    }
  }

  throw new AccessDeniedError("Forbidden", 403);
}

// ── AccessDeniedError ─────────────────────────────────────────
export class AccessDeniedError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 401 | 403 = 403
  ) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

// ── isInternalUser ────────────────────────────────────────────
// True if user has any internal (non-client) role on project.
export async function isInternalUser(projectId: string): Promise<boolean> {
  return hasProjectRole(projectId, INTERNAL_ROLES);
}

// ── getProjectRole ────────────────────────────────────────────
// Returns the role or null if user has no access.
export async function getProjectRole(
  projectId: string
): Promise<ProjectMemberRole | ClientRole | null> {
  try {
    const { role } = await requireProjectAccess(projectId);
    return role;
  } catch {
    return null;
  }
}

// ── isGlobalAdmin ─────────────────────────────────────────────
// True if user has app_metadata.role = owner|admin (set via service role).
// Use this to gate /app/clients and other global-admin pages.
export async function isGlobalAdmin(): Promise<boolean> {
  const sb = await createServerClientAsync();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const role = (user.app_metadata?.role as string | undefined) ?? "";
  return ["owner", "admin"].includes(role);
}

// ── requireGlobalAdmin ────────────────────────────────────────
export async function requireGlobalAdmin(): Promise<string> {
  const ok = await isGlobalAdmin();
  if (!ok) throw new AccessDeniedError("Requer permissão de administrador global", 403);
  const sb = await createServerClientAsync();
  const { data: { user } } = await sb.auth.getUser();
  return user!.id;
}
