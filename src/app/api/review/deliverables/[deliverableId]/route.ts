import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { createReviewNotification, logReviewAudit } from "@/lib/review-events";
import { getProjectAccess, getProjectForDeliverable } from "@/lib/review-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deliverableId: string }> },
) {
  const { deliverableId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const deliverableRef = await getProjectForDeliverable(supabase, deliverableId);
  if (!deliverableRef) {
    return NextResponse.json({ error: "Entregável não encontrado" }, { status: 404 });
  }

  const access = await getProjectAccess(supabase, deliverableRef.project, user.id);
  if (!access.canRead) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  }

  const { data: deliverable } = await supabase
    .from("deliverables")
    .select("id, project_id, title, description, status, created_at, updated_at")
    .eq("id", deliverableId)
    .maybeSingle();

  if (!deliverable) {
    return NextResponse.json({ error: "Entregável não encontrado" }, { status: 404 });
  }

  const { data: versions, error: versionsError } = await supabase
    .from("deliverable_versions")
    .select("id, deliverable_id, version, version_number, file_url, file_type, duration, notes, created_at, published_at, uploaded_by, created_by")
    .eq("deliverable_id", deliverableId)
    .order("version_number", { ascending: false })
    .order("version", { ascending: false })
    .order("created_at", { ascending: false });

  if (versionsError) {
    return NextResponse.json({ error: versionsError.message }, { status: 500 });
  }

  const activeVersionQuery = request.nextUrl.searchParams.get("versionId");
  const selectedVersionId = activeVersionQuery || versions?.[0]?.id || null;

  const { data: approvals, error: approvalsError } = await supabase
    .from("approvals")
    .select("id, deliverable_id, version_id, deliverable_version_id, decision, approved_at, created_at, note, comment, approved_by, approver_user_id")
    .eq("deliverable_id", deliverableId)
    .order("approved_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(25);

  if (approvalsError) {
    return NextResponse.json({ error: approvalsError.message }, { status: 500 });
  }

  const { data: latestFile } = await supabase
    .from("deliverable_files")
    .select("id, filename, shared_link, preview_url, mime_type, file_type")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    deliverable,
    versions: versions ?? [],
    selectedVersionId,
    approvals: approvals ?? [],
    latestFile: latestFile ?? null,
    access,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deliverableId: string }> },
) {
  const { deliverableId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const deliverableRef = await getProjectForDeliverable(supabase, deliverableId);
  if (!deliverableRef) {
    return NextResponse.json({ error: "Entregável não encontrado" }, { status: 404 });
  }

  const access = await getProjectAccess(supabase, deliverableRef.project, user.id);
  if (!access.canWrite) {
    return NextResponse.json({ error: "Sem permissão para publicar versão" }, { status: 403 });
  }

  const body = await request.json() as {
    fileUrl?: string;
    fileType?: string;
    duration?: number;
    notes?: string;
  };

  const { data: existing } = await supabase
    .from("deliverable_versions")
    .select("version, version_number")
    .eq("deliverable_id", deliverableId)
    .order("version_number", { ascending: false })
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestVersion = Math.max(
    Number(existing?.version_number ?? 0),
    Number(existing?.version ?? 0),
  );
  const nextVersion = latestVersion + 1;

  const insertPayload = {
    deliverable_id: deliverableId,
    version: nextVersion,
    version_number: nextVersion,
    file_url: body.fileUrl ?? null,
    file_type: body.fileType ?? null,
    duration: Number.isFinite(body.duration) ? body.duration : null,
    notes: body.notes ?? null,
    created_by: user.id,
    uploaded_by: user.id,
    published_at: new Date().toISOString(),
  };

  const admin = createServiceClient();
  const { data: version, error } = await admin
    .from("deliverable_versions")
    .insert(insertPayload)
    .select("id, deliverable_id, version, version_number, file_url, file_type, duration, notes, created_at, published_at")
    .single();

  if (error || !version) {
    return NextResponse.json({ error: error?.message ?? "Falha ao criar versão" }, { status: 500 });
  }

  await admin
    .from("deliverables")
    .update({ status: "in_review", updated_at: new Date().toISOString() })
    .eq("id", deliverableId);

  const { data: recipients } = await admin
    .from("project_members")
    .select("user_id")
    .eq("project_id", deliverableRef.project.id)
    .in("role", ["client_viewer", "client_approver"]);

  const recipientUserIds = (recipients ?? []).map((entry) => entry.user_id as string).filter(Boolean);
  await createReviewNotification({
    userIds: recipientUserIds,
    type: "new_file",
    payload: {
      deliverable_id: deliverableId,
      version_id: version.id,
      project_id: deliverableRef.project.id,
      version: version.version_number ?? version.version,
    },
  });

  await logReviewAudit({
    actorId: user.id,
    action: "review.version.create",
    entityType: "deliverable_versions",
    entityId: version.id,
    payload: {
      deliverable_id: deliverableId,
      project_id: deliverableRef.project.id,
      version: version.version_number ?? version.version,
    },
  });

  return NextResponse.json({ version }, { status: 201 });
}
