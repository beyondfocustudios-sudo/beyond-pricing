import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { createReviewNotification, logReviewAudit } from "@/lib/review-events";
import { getProjectAccess, getProjectForVersion } from "@/lib/review-auth";

function parseNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function GET(request: NextRequest) {
  const versionId = request.nextUrl.searchParams.get("versionId");
  if (!versionId) {
    return NextResponse.json({ error: "versionId obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const versionRef = await getProjectForVersion(supabase, versionId);
  if (!versionRef) {
    return NextResponse.json({ error: "Versão não encontrada" }, { status: 404 });
  }

  const access = await getProjectAccess(supabase, versionRef.project, user.id);
  if (!access.canRead) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  }

  const { data: threads, error } = await supabase
    .from("review_threads")
    .select("id, version_id, timecode_seconds, x, y, created_by, created_at, status, resolved_at, resolved_by, review_comments(id, thread_id, body, created_by, guest_name, guest_email, created_at)")
    .eq("version_id", versionId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const normalized = (threads ?? []).map((thread) => ({
    ...thread,
    review_comments: [...((thread.review_comments ?? []) as Array<Record<string, unknown>>)].sort(
      (a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime(),
    ),
  }));

  return NextResponse.json({ threads: normalized, access });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    versionId?: string;
    body?: string;
    timecodeSeconds?: number | string | null;
    x?: number | string | null;
    y?: number | string | null;
  };

  const versionId = String(body.versionId ?? "").trim();
  const commentBody = String(body.body ?? "").trim();

  if (!versionId || !commentBody) {
    return NextResponse.json({ error: "versionId e body são obrigatórios" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const versionRef = await getProjectForVersion(supabase, versionId);
  if (!versionRef) {
    return NextResponse.json({ error: "Versão não encontrada" }, { status: 404 });
  }

  const access = await getProjectAccess(supabase, versionRef.project, user.id);
  if (!access.canRead) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  }

  const admin = createServiceClient();

  const { data: thread, error: threadError } = await admin
    .from("review_threads")
    .insert({
      version_id: versionId,
      created_by: user.id,
      timecode_seconds: parseNullableNumber(body.timecodeSeconds),
      x: parseNullableNumber(body.x),
      y: parseNullableNumber(body.y),
      status: "open",
    })
    .select("id, version_id, timecode_seconds, x, y, created_by, created_at, status, resolved_at, resolved_by")
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: threadError?.message ?? "Falha ao criar thread" }, { status: 500 });
  }

  const { data: comment, error: commentError } = await admin
    .from("review_comments")
    .insert({
      thread_id: thread.id,
      body: commentBody,
      created_by: user.id,
    })
    .select("id, thread_id, body, created_by, guest_name, guest_email, created_at")
    .single();

  if (commentError || !comment) {
    return NextResponse.json({ error: commentError?.message ?? "Falha ao criar comentário" }, { status: 500 });
  }

  const { data: recipients } = await admin
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", versionRef.project.id);

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
      project_id: versionRef.project.id,
      deliverable_id: versionRef.deliverableId,
      version_id: versionId,
      thread_id: thread.id,
      comment_id: comment.id,
      kind: "review_comment",
    },
  });

  await logReviewAudit({
    actorId: user.id,
    action: "review.thread.create",
    entityType: "review_threads",
    entityId: thread.id,
    payload: {
      project_id: versionRef.project.id,
      deliverable_id: versionRef.deliverableId,
      version_id: versionId,
      comment_id: comment.id,
      timecode_seconds: thread.timecode_seconds,
      x: thread.x,
      y: thread.y,
    },
  });

  return NextResponse.json({ thread, comment }, { status: 201 });
}
