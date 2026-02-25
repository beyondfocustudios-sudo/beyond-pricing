import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { getProjectAccess } from "@/lib/review-auth";
import { createReviewNotification, logReviewAudit } from "@/lib/review-events";
import { resolveReviewLink } from "@/lib/review-link-access";

function parseNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const versionId = request.nextUrl.searchParams.get("versionId");
  const password = request.nextUrl.searchParams.get("password");

  const admin = createServiceClient();
  const resolved = await resolveReviewLink(admin, token, password);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, requiresPassword: resolved.requiresPassword ?? false },
      { status: resolved.status },
    );
  }

  const selectedVersionId = versionId || (await admin
    .from("deliverable_versions")
    .select("id")
    .eq("deliverable_id", resolved.data.deliverable.id)
    .order("version_number", { ascending: false })
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()).data?.id || null;

  if (!selectedVersionId) {
    return NextResponse.json({ threads: [] });
  }

  const { data: threads, error } = await admin
    .from("review_threads")
    .select("id, version_id, timecode_seconds, x, y, created_by, created_at, status, resolved_at, resolved_by, review_comments(id, thread_id, body, created_by, guest_name, guest_email, created_at)")
    .eq("version_id", selectedVersionId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    selectedVersionId,
    threads: (threads ?? []).map((thread) => ({
      ...thread,
      review_comments: [...((thread.review_comments ?? []) as Array<Record<string, unknown>>)].sort(
        (a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime(),
      ),
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.json() as {
    versionId?: string;
    threadId?: string;
    body?: string;
    name?: string;
    email?: string;
    password?: string;
    timecodeSeconds?: number | string | null;
    x?: number | string | null;
    y?: number | string | null;
  };

  const commentBody = String(body.body ?? "").trim();
  const versionId = String(body.versionId ?? "").trim();
  const threadId = String(body.threadId ?? "").trim();
  if (!commentBody || (!versionId && !threadId)) {
    return NextResponse.json({ error: "Comentário inválido" }, { status: 400 });
  }

  const admin = createServiceClient();
  const resolved = await resolveReviewLink(admin, token, body.password ?? null);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, requiresPassword: resolved.requiresPassword ?? false },
      { status: resolved.status },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (resolved.data.link.require_auth && !user) {
    return NextResponse.json({ error: "Autenticação necessária para este link." }, { status: 401 });
  }

  let access: Awaited<ReturnType<typeof getProjectAccess>> | null = null;
  if (user) {
    const { data: project } = await admin
      .from("projects")
      .select("id, client_id, user_id, owner_user_id")
      .eq("id", resolved.data.deliverable.project_id)
      .maybeSingle();

    if (project) {
      access = await getProjectAccess(supabase, {
        id: project.id as string,
        client_id: (project.client_id as string | null) ?? null,
        user_id: (project.user_id as string | null) ?? null,
        owner_user_id: (project.owner_user_id as string | null) ?? null,
      }, user.id);
    }

    if (resolved.data.link.require_auth && (!access || !access.canRead)) {
      return NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 });
    }
  }

  if (!user && !resolved.data.link.allow_guest_comments) {
    return NextResponse.json({ error: "Comentários de convidado não permitidos." }, { status: 403 });
  }

  let targetThreadId = threadId;
  if (!targetThreadId) {
    const { data: thread, error: threadError } = await admin
      .from("review_threads")
      .insert({
        version_id: versionId,
        timecode_seconds: parseNullableNumber(body.timecodeSeconds),
        x: parseNullableNumber(body.x),
        y: parseNullableNumber(body.y),
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: threadError?.message ?? "Falha ao criar thread" }, { status: 500 });
    }

    targetThreadId = thread.id;
  }

  const insertPayload: Record<string, unknown> = {
    thread_id: targetThreadId,
    body: commentBody,
    created_by: user?.id ?? null,
  };

  if (!user) {
    insertPayload.guest_name = String(body.name ?? "Convidado").trim() || "Convidado";
    const guestEmail = String(body.email ?? "").trim().toLowerCase();
    if (guestEmail) insertPayload.guest_email = guestEmail;
  }

  const { data: comment, error: commentError } = await admin
    .from("review_comments")
    .insert(insertPayload)
    .select("id, thread_id, body, created_by, guest_name, guest_email, created_at")
    .single();

  if (commentError || !comment) {
    return NextResponse.json({ error: commentError?.message ?? "Falha ao criar comentário" }, { status: 500 });
  }

  const { data: members } = await admin
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", resolved.data.deliverable.project_id);

  const notifyRoles = !user || access?.isClientUser
    ? ["owner", "admin", "editor", "producer"]
    : ["client_viewer", "client_approver"];

  const recipients = (members ?? [])
    .filter((member) => notifyRoles.includes(String(member.role)) && String(member.user_id) !== (user?.id ?? ""))
    .map((member) => String(member.user_id));

  await createReviewNotification({
    userIds: recipients,
    type: "new_message",
    payload: {
      kind: "review_comment",
      project_id: resolved.data.deliverable.project_id,
      deliverable_id: resolved.data.deliverable.id,
      version_id: versionId || null,
      thread_id: targetThreadId,
      comment_id: comment.id,
      guest: !user,
    },
  });

  if (resolved.data.link.single_use && resolved.data.link.use_count === 0) {
    await admin
      .from("review_links")
      .update({
        use_count: 1,
        used_at: new Date().toISOString(),
        used_by_user_id: user?.id ?? null,
      })
      .eq("id", resolved.data.link.id);
  }

  await logReviewAudit({
    actorId: user?.id ?? null,
    action: "review.link.comment",
    entityType: "review_comments",
    entityId: comment.id,
    payload: {
      project_id: resolved.data.deliverable.project_id,
      deliverable_id: resolved.data.deliverable.id,
      thread_id: targetThreadId,
      guest: !user,
    },
  });

  return NextResponse.json({ comment, threadId: targetThreadId }, { status: 201 });
}
