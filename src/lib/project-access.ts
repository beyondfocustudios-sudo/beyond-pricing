import { createServiceClient } from "@/lib/supabase/service";

type TeamRole = "owner" | "admin" | "member";

function isTeamRole(role: string | null | undefined): role is TeamRole {
  return role === "owner" || role === "admin" || role === "member";
}

export async function resolveProjectManageAccess(projectId: string, userId: string) {
  const admin = createServiceClient();

  const [teamRowRes, projectRowRes, projectMemberRes] = await Promise.all([
    admin.from("team_members").select("role").eq("user_id", userId).maybeSingle(),
    admin
      .from("projects")
      .select("id, user_id, owner_user_id, deleted_at")
      .eq("id", projectId)
      .maybeSingle(),
    admin
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!projectRowRes.data?.id) {
    return { ok: false as const, reason: "not_found" };
  }

  const teamRole = String(teamRowRes.data?.role ?? "").toLowerCase();
  const projectRole = String(projectMemberRes.data?.role ?? "").toLowerCase();
  const isOwner = projectRowRes.data.user_id === userId || projectRowRes.data.owner_user_id === userId;

  const hasProjectRole = projectRole === "owner" || projectRole === "admin" || projectRole === "editor";
  const allowed = isTeamRole(teamRole) || hasProjectRole || isOwner;

  if (!allowed) {
    return { ok: false as const, reason: "forbidden" };
  }

  return {
    ok: true as const,
    project: projectRowRes.data,
    admin,
  };
}
