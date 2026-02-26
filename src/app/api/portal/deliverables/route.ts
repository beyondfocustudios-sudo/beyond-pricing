import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectAccess } from "@/lib/authz";

type DeliverableRow = {
  id: string;
  project_id: string;
  title: string;
  status: string | null;
  created_at: string;
};

type DeliverableFileRow = {
  deliverable_id: string | null;
  file_type?: string | null;
  shared_link?: string | null;
  preview_url?: string | null;
  dropbox_path?: string | null;
};

function toLink(file: DeliverableFileRow) {
  return file.shared_link || file.preview_url || file.dropbox_path || null;
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

  const { data: deliverablesData, error: deliverablesError } = await supabase
    .from("deliverables")
    .select("id, project_id, title, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (deliverablesError) {
    return NextResponse.json({ deliverables: [] });
  }

  const deliverables = (deliverablesData ?? []) as DeliverableRow[];
  const deliverableIds = deliverables.map((row) => row.id);

  const filesByDeliverable = new Map<string, DeliverableFileRow>();
  if (deliverableIds.length > 0) {
    const { data: fileRows } = await supabase
      .from("deliverable_files")
      .select("deliverable_id, file_type, shared_link, preview_url, dropbox_path, created_at")
      .eq("project_id", projectId)
      .in("deliverable_id", deliverableIds)
      .order("created_at", { ascending: false });

    for (const file of (fileRows ?? []) as DeliverableFileRow[]) {
      const key = file.deliverable_id;
      if (!key || filesByDeliverable.has(key)) continue;
      filesByDeliverable.set(key, file);
    }
  }

  const payload = deliverables.map((row) => {
    const file = filesByDeliverable.get(row.id);
    return {
      ...row,
      file_type: file?.file_type ?? null,
      dropbox_url: file ? toLink(file) : null,
    };
  });

  return NextResponse.json({ deliverables: payload });
}
