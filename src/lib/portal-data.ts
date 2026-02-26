import { createClient } from "@/lib/supabase";

export type PortalProject = {
  id: string;
  name: string;
  status: string | null;
  description?: string | null;
  updated_at: string;
  client_id?: string | null;
};

export type PortalDeliverable = {
  id: string;
  file_id?: string | null;
  project_id: string;
  title: string;
  status: string | null;
  file_type: string | null;
  mime_type?: string | null;
  filename?: string | null;
  dropbox_url: string | null;
  created_at: string;
  is_demo?: boolean;
};

export type PortalMilestone = {
  id: string;
  project_id: string;
  title: string;
  phase: string | null;
  status: string | null;
  due_date: string | null;
  progress_percent: number | null;
  description: string | null;
};

export type PortalDocument = {
  id: string;
  project_id: string;
  title: string;
  status: string | null;
  type: string | null;
  url: string | null;
  created_at: string | null;
};

export type PortalReference = {
  id: string;
  project_id: string;
  title: string;
  status: string | null;
  platform: string | null;
  notes: string | null;
  url: string | null;
  created_at: string | null;
};

export type PortalConversation = {
  id: string;
  project_id: string;
  updated_at: string;
  project_name: string | null;
  unread_count: number;
  last_message: string | null;
};

export type PortalMessage = {
  id: string;
  conversation_id: string;
  sender_type: "client" | "team" | string;
  body: string;
  created_at: string;
};

type ProjectMemberRow = {
  project_id: string;
  projects: (
    | {
      id: string;
      project_name: string;
      status: string | null;
      updated_at: string;
      client_id?: string | null;
    }
    | Array<{
      id: string;
      project_name: string;
      status: string | null;
      updated_at: string;
      client_id?: string | null;
    }>
  ) | null;
};

export async function getClientProjects() {
  const supabase = createClient();
  const { data: memberRows } = await supabase
    .from("project_members")
    .select("project_id, role, projects:project_id(id, project_name, status, updated_at, client_id)")
    .in("role", ["client_viewer", "client_approver"])
    .not("projects", "is", null);

  const map = new Map<string, PortalProject>();
  for (const row of (memberRows ?? []) as ProjectMemberRow[]) {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    if (!project?.id) continue;
    map.set(project.id, {
      id: project.id,
      name: project.project_name,
      status: project.status ?? null,
      description: null,
      updated_at: project.updated_at,
      client_id: project.client_id ?? null,
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

export async function getProjectDeliverables(projectId: string) {
  const res = await fetch(`/api/portal/deliverables?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
  if (!res.ok) return [];
  const payload = (await res.json().catch(() => ({}))) as { deliverables?: PortalDeliverable[] };
  return Array.isArray(payload.deliverables) ? payload.deliverables : [];
}

export async function getProjectMilestones(projectId: string) {
  const res = await fetch(`/api/portal/milestones?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => [])) as PortalMilestone[];
  return Array.isArray(data) ? data : [];
}

export async function getProjectDocuments(projectId: string) {
  const res = await fetch(`/api/portal/documents?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
  if (!res.ok) return [];
  const payload = (await res.json().catch(() => ({}))) as { documents?: PortalDocument[] };
  return Array.isArray(payload.documents) ? payload.documents : [];
}

export async function getProjectReferences(projectId: string) {
  const res = await fetch(`/api/portal/references?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
  if (!res.ok) return [];
  const payload = (await res.json().catch(() => ({}))) as { references?: PortalReference[] };
  return Array.isArray(payload.references) ? payload.references : [];
}

export async function getConversationForProject(projectId: string) {
  const res = await fetch(`/api/conversations?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
  if (!res.ok) return null;
  const payload = (await res.json().catch(() => ({}))) as { conversation?: { id?: string }; id?: string };
  const id = payload.conversation?.id ?? payload.id;
  return id ? String(id) : null;
}

export async function getMessages(conversationId: string) {
  const res = await fetch(`/api/messages?conversationId=${encodeURIComponent(conversationId)}&limit=80`, { cache: "no-store" });
  if (!res.ok) return [];
  const payload = (await res.json().catch(() => ({}))) as { messages?: PortalMessage[] };
  return Array.isArray(payload.messages) ? payload.messages : [];
}

export async function getConversations() {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const payload = (await res.json().catch(() => ({}))) as { conversations?: PortalConversation[] };
  return Array.isArray(payload.conversations) ? payload.conversations : [];
}

export async function sendConversationMessage(conversationId: string, body: string) {
  const res = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, body }),
  });
  return res.ok;
}
