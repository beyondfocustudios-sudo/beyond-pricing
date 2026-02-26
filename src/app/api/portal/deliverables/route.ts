import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireProjectAccess } from "@/lib/authz";
import { toDemoPortalDeliverables } from "@/lib/dropbox-demo";

type DeliverableRow = {
  id: string;
  project_id: string;
  title: string;
  status: string | null;
  created_at: string;
};

type DeliverableFileRow = {
  id: string;
  project_id: string;
  deliverable_id: string | null;
  file_type?: string | null;
  mime_type?: string | null;
  mime?: string | null;
  shared_link?: string | null;
  preview_url?: string | null;
  dropbox_path?: string | null;
  created_at: string;
  filename?: string | null;
  name?: string | null;
  path?: string | null;
  file_size?: number | null;
  bytes?: number | null;
  size_bytes?: number | null;
  modified_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function toLink(file: DeliverableFileRow) {
  return file.shared_link || file.preview_url || null;
}

function toFileType(file: DeliverableFileRow) {
  const raw = String(file.file_type ?? "").toLowerCase();
  if (raw.includes("video")) return "video";
  if (raw.includes("image") || raw.includes("photo")) return "image";

  const mime = String(file.mime_type ?? file.mime ?? "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return "document";
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  try {
    await requireProjectAccess(projectId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const { data: deliverablesData, error: deliverablesError } = await supabase
    .from("deliverables")
    .select("id, project_id, title, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(120);

  const deliverables = (deliverablesData ?? []) as DeliverableRow[];
  const deliverableIds = deliverables.map((row) => row.id);
  const filesByDeliverable = new Map<string, DeliverableFileRow>();

  if (deliverableIds.length > 0) {
    const { data: fileRows } = await supabase
      .from("deliverable_files")
      .select("id, project_id, deliverable_id, file_type, mime_type, mime, shared_link, preview_url, dropbox_path, created_at, filename, name")
      .eq("project_id", projectId)
      .in("deliverable_id", deliverableIds)
      .order("created_at", { ascending: false });

    for (const file of (fileRows ?? []) as DeliverableFileRow[]) {
      const key = file.deliverable_id;
      if (!key || filesByDeliverable.has(key)) continue;
      filesByDeliverable.set(key, file);
    }
  }

  let clientUserId: string | null = null;
  if (userId) {
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    clientUserId = (clientUser?.id as string | null) ?? null;
  }

  const fileIds = Array.from(filesByDeliverable.values()).map((file) => file.id);
  const viewsByFile = new Map<string, string>();
  if (clientUserId && fileIds.length > 0) {
    const { data: views } = await supabase
      .from("portal_file_views")
      .select("file_id,last_seen_at")
      .eq("client_user_id", clientUserId)
      .eq("project_id", projectId)
      .in("file_id", fileIds);
    for (const row of (views ?? []) as Array<{ file_id: string; last_seen_at: string }>) {
      viewsByFile.set(row.file_id, row.last_seen_at);
    }
  }

  const payload = deliverables.map((row) => {
    const file = filesByDeliverable.get(row.id);
    const createdAt = file?.created_at ?? row.created_at;
    const modifiedAt = file?.modified_at ?? createdAt;
    const lastSeenAt = file?.id ? viewsByFile.get(file.id) ?? null : null;
    const ageMs = Date.now() - new Date(createdAt).getTime();
    const status = row.status ?? (Number.isFinite(ageMs) && ageMs <= 7 * 24 * 60 * 60 * 1000 ? "new" : "active");
    const isNew = !lastSeenAt || new Date(modifiedAt).getTime() > new Date(lastSeenAt).getTime();
    return {
      ...row,
      created_at: createdAt,
      modified_at: modifiedAt,
      file_id: file?.id ?? null,
      file_type: file ? toFileType(file) : null,
      mime_type: file?.mime_type ?? file?.mime ?? null,
      filename: file?.filename ?? file?.name ?? null,
      name: file?.name ?? file?.filename ?? null,
      ext: String((file?.filename ?? file?.name ?? "").split(".").pop() ?? "").toLowerCase() || null,
      path: file?.path ?? file?.dropbox_path ?? null,
      size_bytes: file?.size_bytes ?? file?.file_size ?? file?.bytes ?? null,
      metadata: file?.metadata ?? null,
      dropbox_url: file ? toLink(file) : null,
      last_seen_at: lastSeenAt,
      is_new: isNew,
      status,
      is_demo: false,
    };
  });

  if (!deliverablesError && payload.length > 0) {
    return NextResponse.json({ deliverables: payload, source: "dropbox" });
  }

  // Demo fallback when no Dropbox files are available.
  const service = createServiceClient();
  const { data: hasConnection } = await service
    .from("dropbox_connections")
    .select("id")
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  if (!hasConnection) {
    return NextResponse.json({
      deliverables: toDemoPortalDeliverables(projectId),
      source: "demo",
    });
  }

  return NextResponse.json({
    deliverables: payload,
    source: "dropbox",
    sync_needed: payload.length === 0,
  });
}
