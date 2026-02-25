import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { getProjectAccess, getProjectForThread } from "@/lib/review-auth";
import { logReviewAudit } from "@/lib/review-events";

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    threadId?: string;
    commentId?: string;
  };

  const threadId = String(body.threadId ?? "").trim();
  if (!threadId) {
    return NextResponse.json({ error: "threadId obrigatório" }, { status: 400 });
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
  if (!access.canWrite) {
    return NextResponse.json({ error: "Sem permissão para criar tarefa" }, { status: 403 });
  }

  const commentId = String(body.commentId ?? "").trim();

  const commentsQuery = supabase
    .from("review_comments")
    .select("id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const { data: comments } = commentId
    ? await commentsQuery.eq("id", commentId)
    : await commentsQuery;

  const sourceComment = comments?.[0];

  const title = sourceComment
    ? `Review: ${sourceComment.body.slice(0, 48)}`
    : "Review comment follow-up";

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const threadUrl = appBaseUrl
    ? `${appBaseUrl}/portal/review/${threadRef.deliverableId}?v=${threadRef.versionId}&thread=${threadId}`
    : `/portal/review/${threadRef.deliverableId}?v=${threadRef.versionId}&thread=${threadId}`;

  const description = sourceComment
    ? `${sourceComment.body}\n\nThread: ${threadUrl}`
    : `Thread: ${threadUrl}`;

  const admin = createServiceClient();
  const { data: task, error } = await admin
    .from("tasks")
    .insert({
      user_id: user.id,
      project_id: threadRef.project.id,
      title,
      description,
      status: "todo",
      priority: "medium",
    })
    .select("id, title, status, project_id, created_at")
    .single();

  if (error || !task) {
    return NextResponse.json({ error: error?.message ?? "Falha ao criar tarefa" }, { status: 500 });
  }

  await logReviewAudit({
    actorId: user.id,
    action: "review.comment.to_task",
    entityType: "tasks",
    entityId: task.id,
    payload: {
      project_id: threadRef.project.id,
      deliverable_id: threadRef.deliverableId,
      version_id: threadRef.versionId,
      thread_id: threadId,
      comment_id: sourceComment?.id ?? null,
    },
  });

  return NextResponse.json({ task }, { status: 201 });
}
