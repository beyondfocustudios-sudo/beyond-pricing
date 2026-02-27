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
  name?: string | null;
  ext?: string | null;
  path?: string | null;
  size_bytes?: number | null;
  modified_at?: string | null;
  metadata?: Record<string, unknown> | null;
  dropbox_url: string | null;
  created_at: string;
  last_seen_at?: string | null;
  is_new?: boolean;
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
  platform: string | null;
  notes: string | null;
  url: string | null;
  tags: string[] | null;
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

export type PortalUpdate = {
  id: string;
  type: "message" | "review" | "delivery" | "request";
  title: string;
  body: string | null;
  author: string | null;
  created_at: string;
  status: string | null;
  milestone_id: string | null;
  href: string;
};

// ─── Project Phase types (for Milestone Timeline) ─────────────────────────────

export type PhaseStatus = "done" | "in_progress" | "delayed" | "pending";

export type ProjectPhase = {
  key: "pre_producao" | "rodagem" | "pos_producao" | "entrega";
  label: string;
  status: PhaseStatus;
  due_date: string | null;
  /** 0–100 */
  progress_percent: number;
  milestones: PortalMilestone[];
};

const PHASE_ORDER = [
  "pre_producao",
  "rodagem",
  "pos_producao",
  "entrega",
] as const;

const PHASE_LABELS: Record<(typeof PHASE_ORDER)[number], string> = {
  pre_producao: "Pré-Produção",
  rodagem: "Rodagem",
  pos_producao: "Pós-Produção",
  entrega: "Entrega",
};

function phaseStatusFrom(phaseMilestones: PortalMilestone[]): PhaseStatus {
  if (phaseMilestones.length === 0) return "pending";
  const allDone = phaseMilestones.every(
    (m) => (m.status ?? "pending").toLowerCase() === "done",
  );
  if (allDone) return "done";
  const anyDelayed = phaseMilestones.some((m) => {
    const s = (m.status ?? "").toLowerCase();
    return s === "delayed" || s === "blocked" || s === "at-risk";
  });
  if (anyDelayed) return "delayed";
  const anyInProgress = phaseMilestones.some((m) => {
    const s = (m.status ?? "").toLowerCase();
    return s === "in_progress" || s === "in progress";
  });
  if (anyInProgress) return "in_progress";
  return "pending";
}

/**
 * Aggregates raw milestones into the 4 canonical project phases.
 * Pure function – safe to call client-side.
 */
export function computeProjectPhases(
  milestones: PortalMilestone[],
): ProjectPhase[] {
  return PHASE_ORDER.map((key) => {
    const phaseMilestones = milestones.filter((m) => m.phase === key);
    const status = phaseStatusFrom(phaseMilestones);

    const progressSum = phaseMilestones.reduce((acc, m) => {
      if ((m.status ?? "").toLowerCase() === "done") return acc + 100;
      return acc + (m.progress_percent ?? 0);
    }, 0);
    const progress_percent =
      phaseMilestones.length > 0
        ? Math.round(progressSum / phaseMilestones.length)
        : 0;

    const dueDates = phaseMilestones
      .map((m) => m.due_date)
      .filter((d): d is string => d !== null)
      .sort();
    const due_date = dueDates.at(-1) ?? null;

    return {
      key,
      label: PHASE_LABELS[key],
      status,
      due_date,
      progress_percent,
      milestones: phaseMilestones,
    };
  });
}

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
  const res = await fetch(`/api/portal/deliveries?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
  if (!res.ok) return [];
  const payload = (await res.json().catch(() => ({}))) as { deliverables?: PortalDeliverable[] };
  return Array.isArray(payload.deliverables) ? payload.deliverables : [];
}

export async function getProjectUpdates(projectId: string) {
  const res = await fetch(`/api/portal/updates?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
  if (!res.ok) return [];
  const payload = (await res.json().catch(() => ({}))) as { updates?: PortalUpdate[] };
  return Array.isArray(payload.updates) ? payload.updates : [];
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

export async function createReference(
  projectId: string,
  data: { title: string; url?: string | null; platform?: string | null; notes?: string | null; tags?: string[] | null }
) {
  const res = await fetch("/api/portal/references", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, ...data }),
  });
  if (!res.ok) throw new Error("Failed to create reference");
  const payload = (await res.json().catch(() => ({}))) as { reference?: PortalReference };
  return payload.reference;
}

export async function updateReference(
  projectId: string,
  id: string,
  data: { title?: string; url?: string | null; platform?: string | null; notes?: string | null; tags?: string[] | null }
) {
  const res = await fetch(`/api/portal/references/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, ...data }),
  });
  if (!res.ok) throw new Error("Failed to update reference");
  const payload = (await res.json().catch(() => ({}))) as { reference?: PortalReference };
  return payload.reference;
}

export async function deleteReference(projectId: string, id: string) {
  const res = await fetch(`/api/portal/references/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) throw new Error("Failed to delete reference");
  return true;
}
