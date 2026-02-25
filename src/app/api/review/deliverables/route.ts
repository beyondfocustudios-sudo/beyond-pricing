import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { createReviewNotification, logReviewAudit } from "@/lib/review-events";
import { getProjectAccess } from "@/lib/review-auth";

type ProjectRow = {
  id: string;
  client_id: string | null;
  user_id: string | null;
  owner_user_id: string | null;
};

type CreatedVersion = {
  id: string;
};

async function getProject(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string) {
  const { data } = await supabase
    .from("projects")
    .select("id, client_id, user_id, owner_user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: String(data.id),
    client_id: (data.client_id as string | null) ?? null,
    user_id: (data.user_id as string | null) ?? null,
    owner_user_id: (data.owner_user_id as string | null) ?? null,
  } as ProjectRow;
}

export async function GET(request: NextRequest) {
  const projectId = String(request.nextUrl.searchParams.get("projectId") ?? "").trim();
  if (!projectId) {
    return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const project = await getProject(supabase, projectId);
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  const access = await getProjectAccess(supabase, project, user.id);
  if (!access.canRead) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("deliverables")
    .select("id, project_id, title, description, status, created_at, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deliverables: data ?? [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    projectId?: string;
    title?: string;
    description?: string;
    fileUrl?: string;
    fileType?: string;
    duration?: number;
    notes?: string;
  };

  const projectId = String(body.projectId ?? "").trim();
  const title = String(body.title ?? "").trim();

  if (!projectId || !title) {
    return NextResponse.json({ error: "projectId e title são obrigatórios" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const project = await getProject(supabase, projectId);
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  const access = await getProjectAccess(supabase, project, user.id);
  if (!access.canWrite) {
    return NextResponse.json({ error: "Sem permissão para criar entregável" }, { status: 403 });
  }

  const admin = createServiceClient();
  const now = new Date().toISOString();

  const hasFile = Boolean(String(body.fileUrl ?? "").trim());
  const nextStatus = hasFile ? "in_review" : "pending";

  const { data: deliverable, error: deliverableError } = await admin
    .from("deliverables")
    .insert({
      project_id: projectId,
      title,
      description: String(body.description ?? "").trim() || null,
      status: nextStatus,
      updated_at: now,
    })
    .select("id, project_id, title, description, status, created_at, updated_at")
    .single();

  if (deliverableError || !deliverable) {
    return NextResponse.json({ error: deliverableError?.message ?? "Falha ao criar entregável" }, { status: 500 });
  }

  let version: CreatedVersion | null = null;
  if (hasFile) {
    const { data: createdVersion, error: versionError } = await admin
      .from("deliverable_versions")
      .insert({
        deliverable_id: deliverable.id,
        version: 1,
        version_number: 1,
        file_url: String(body.fileUrl ?? "").trim(),
        file_type: String(body.fileType ?? "").trim() || null,
        duration: Number.isFinite(body.duration) ? Number(body.duration) : null,
        notes: String(body.notes ?? "").trim() || null,
        created_by: user.id,
        uploaded_by: user.id,
        published_at: now,
      })
      .select("id, deliverable_id, version, version_number, file_url, file_type, duration, notes, created_at, published_at")
      .single();

    if (versionError || !createdVersion) {
      return NextResponse.json({ error: versionError?.message ?? "Falha ao criar versão" }, { status: 500 });
    }
    version = { id: String(createdVersion.id) };
  }

  const { data: recipients } = await admin
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .in("role", ["client_viewer", "client_approver"]);

  const recipientUserIds = (recipients ?? []).map((entry) => String(entry.user_id)).filter(Boolean);
  await createReviewNotification({
    userIds: recipientUserIds,
    type: hasFile ? "new_file" : "new_message",
    payload: {
      project_id: projectId,
      deliverable_id: deliverable.id,
      version_id: version?.id ?? null,
      kind: hasFile ? "deliverable_created_with_version" : "deliverable_created",
    },
  });

  await logReviewAudit({
    actorId: user.id,
    action: "review.deliverable.create",
    entityType: "deliverables",
    entityId: String(deliverable.id),
    payload: {
      project_id: projectId,
      deliverable_id: deliverable.id,
      version_id: version?.id ?? null,
      title,
    },
  });

  return NextResponse.json({ deliverable, version }, { status: 201 });
}
