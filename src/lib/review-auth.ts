import type { SupabaseClient } from "@supabase/supabase-js";

type ProjectRow = {
  id: string;
  client_id: string | null;
  user_id?: string | null;
  owner_user_id?: string | null;
};

export type ReviewAccess = {
  canRead: boolean;
  canWrite: boolean;
  canApprove: boolean;
  projectMemberRole: string | null;
  teamRole: string | null;
  isClientUser: boolean;
};

async function getProjectMemberRole(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data?.role as string | null) ?? null;
}

async function getTeamRole(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("team_members")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  return (data?.role as string | null) ?? null;
}

async function isClientUserForProject(
  supabase: SupabaseClient,
  userId: string,
  clientId: string | null,
): Promise<boolean> {
  if (!clientId) return false;

  const { data } = await supabase
    .from("client_users")
    .select("id")
    .eq("client_id", clientId)
    .eq("user_id", userId)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function getProjectAccess(
  supabase: SupabaseClient,
  project: ProjectRow,
  userId: string,
): Promise<ReviewAccess> {
  const [projectMemberRole, teamRole, isClientUser] = await Promise.all([
    getProjectMemberRole(supabase, project.id, userId),
    getTeamRole(supabase, userId),
    isClientUserForProject(supabase, userId, project.client_id),
  ]);

  const isTeamAdmin = teamRole === "owner" || teamRole === "admin";
  const isProjectWriter = projectMemberRole === "owner" || projectMemberRole === "admin" || projectMemberRole === "editor";
  const isProjectApprover = projectMemberRole === "owner" || projectMemberRole === "admin" || projectMemberRole === "client_approver";
  const isProjectOwner = project.owner_user_id === userId || project.user_id === userId;

  const canWrite = isTeamAdmin || isProjectWriter || isProjectOwner;
  const canRead = canWrite || isClientUser || projectMemberRole != null || teamRole != null;
  const canApprove = isTeamAdmin || isProjectApprover || isProjectOwner;

  return {
    canRead,
    canWrite,
    canApprove,
    projectMemberRole,
    teamRole,
    isClientUser,
  };
}

export async function getProjectForDeliverable(
  supabase: SupabaseClient,
  deliverableId: string,
): Promise<{ id: string; project: ProjectRow } | null> {
  const { data } = await supabase
    .from("deliverables")
    .select("id, project_id, projects:project_id(id, client_id, user_id, owner_user_id)")
    .eq("id", deliverableId)
    .maybeSingle();

  if (!data) return null;
  const project = Array.isArray(data.projects) ? data.projects[0] : data.projects;
  if (!project) return null;

  return {
    id: data.id as string,
    project: {
      id: project.id as string,
      client_id: (project.client_id as string | null) ?? null,
      user_id: (project.user_id as string | null) ?? null,
      owner_user_id: (project.owner_user_id as string | null) ?? null,
    },
  };
}

export async function getProjectForVersion(
  supabase: SupabaseClient,
  versionId: string,
): Promise<{ id: string; deliverableId: string; project: ProjectRow } | null> {
  const { data } = await supabase
    .from("deliverable_versions")
    .select("id, deliverable_id, deliverables:deliverable_id(id, project_id, projects:project_id(id, client_id, user_id, owner_user_id))")
    .eq("id", versionId)
    .maybeSingle();

  if (!data) return null;

  const deliverable = Array.isArray(data.deliverables) ? data.deliverables[0] : data.deliverables;
  const project = Array.isArray(deliverable?.projects) ? deliverable?.projects[0] : deliverable?.projects;
  if (!deliverable || !project) return null;

  return {
    id: data.id as string,
    deliverableId: deliverable.id as string,
    project: {
      id: project.id as string,
      client_id: (project.client_id as string | null) ?? null,
      user_id: (project.user_id as string | null) ?? null,
      owner_user_id: (project.owner_user_id as string | null) ?? null,
    },
  };
}

export async function getProjectForThread(
  supabase: SupabaseClient,
  threadId: string,
): Promise<{ id: string; versionId: string; deliverableId: string; project: ProjectRow } | null> {
  const { data } = await supabase
    .from("review_threads")
    .select("id, version_id, deliverable_versions:version_id(id, deliverable_id, deliverables:deliverable_id(id, project_id, projects:project_id(id, client_id, user_id, owner_user_id)))")
    .eq("id", threadId)
    .maybeSingle();

  if (!data) return null;
  const version = Array.isArray(data.deliverable_versions) ? data.deliverable_versions[0] : data.deliverable_versions;
  const deliverable = Array.isArray(version?.deliverables) ? version?.deliverables[0] : version?.deliverables;
  const project = Array.isArray(deliverable?.projects) ? deliverable?.projects[0] : deliverable?.projects;
  if (!version || !deliverable || !project) return null;

  return {
    id: data.id as string,
    versionId: version.id as string,
    deliverableId: deliverable.id as string,
    project: {
      id: project.id as string,
      client_id: (project.client_id as string | null) ?? null,
      user_id: (project.user_id as string | null) ?? null,
      owner_user_id: (project.owner_user_id as string | null) ?? null,
    },
  };
}
