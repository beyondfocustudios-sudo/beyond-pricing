import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { createReviewNotification, logReviewAudit } from "@/lib/review-events";
import { getProjectAccess, getProjectForThread } from "@/lib/review-auth";

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    threadId?: string;
    body?: string;
  };

  const threadId = String(body.threadId ?? "").trim();
  const commentBody = String(body.body ?? "").trim();

  if (!threadId || !commentBody) {
    return NextResponse.json({ error: "threadId e body são obrigatórios" }, { status: 400 });
  }

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

  const admin = createServiceClient();
  const { data: comment, error } = await admin
    .from("review_comments")
    .insert({
      thread_id: threadId,
      body: commentBody,
      created_by: user.id,
    })
    .select("id, thread_id, body, created_by, guest_name, guest_email, created_at")
    .single();

  if (error || !comment) {
    return NextResponse.json({ error: error?.message ?? "Falha ao criar comentário" }, { status: 500 });
  }

  await admin
    .from("review_threads")
    .update({ status: "open", resolved_at: null, resolved_by: null })
    .eq("id", threadId);

  const { data: recipients } = await admin
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", threadRef.project.id);

  const notifyRoles = access.isClientUser
    ? ["owner", "admin", "editor", "producer"]
    : ["client_viewer", "client_approver"];

  const recipientUserIds = (recipients ?? [])
    .filter((member) => notifyRoles.includes(String(member.role)) && member.user_id !== user.id)
    .map((member) => String(member.user_id));

  await createReviewNotification({
    userIds: recipientUserIds,
    type: "new_message",
    payload: {
      project_id: threadRef.project.id,
      deliverable_id: threadRef.deliverableId,
      version_id: threadRef.versionId,
      thread_id: threadId,
      comment_id: comment.id,
      kind: "review_reply",
    },
  });

  await logReviewAudit({
    actorId: user.id,
    action: "review.comment.create",
    entityType: "review_comments",
    entityId: comment.id,
    payload: {
      project_id: threadRef.project.id,
      deliverable_id: threadRef.deliverableId,
      version_id: threadRef.versionId,
      thread_id: threadId,
    },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
