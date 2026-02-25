import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { getProjectAccess, getProjectForThread } from "@/lib/review-auth";
import { logReviewAudit } from "@/lib/review-events";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const body = await request.json() as { status?: "open" | "resolved" };
  const status = body.status === "resolved" ? "resolved" : "open";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const threadRef = await getProjectForThread(supabase, threadId);
  if (!threadRef) {
    return NextResponse.json({ error: "Thread não encontrada" }, { status: 404 });
  }

  const access = await getProjectAccess(supabase, threadRef.project, user.id);
  if (!access.canRead) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  }

  const { data: thread } = await supabase
    .from("review_threads")
    .select("id, created_by")
    .eq("id", threadId)
    .maybeSingle();

  const isOwner = thread?.created_by === user.id;
  if (!access.canWrite && !isOwner) {
    return NextResponse.json({ error: "Sem permissão para alterar thread" }, { status: 403 });
  }

  const admin = createServiceClient();
  const { data: updated, error } = await admin
    .from("review_threads")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      resolved_by: status === "resolved" ? user.id : null,
    })
    .eq("id", threadId)
    .select("id, version_id, timecode_seconds, x, y, created_by, created_at, status, resolved_at, resolved_by")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Falha ao atualizar thread" }, { status: 500 });
  }

  await logReviewAudit({
    actorId: user.id,
    action: status === "resolved" ? "review.thread.resolve" : "review.thread.reopen",
    entityType: "review_threads",
    entityId: threadId,
    payload: {
      project_id: threadRef.project.id,
      deliverable_id: threadRef.deliverableId,
      version_id: threadRef.versionId,
      status,
    },
  });

  return NextResponse.json({ thread: updated });
}
