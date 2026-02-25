import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { getProjectAccess } from "@/lib/review-auth";
import { resolveReviewLink } from "@/lib/review-link-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const password = request.nextUrl.searchParams.get("password");
  const requestedVersionId = request.nextUrl.searchParams.get("versionId");

  if (!token) {
    return NextResponse.json({ error: "Token em falta" }, { status: 400 });
  }

  const admin = createServiceClient();
  const resolved = await resolveReviewLink(admin, token, password);
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

  let access: { canRead: boolean; canWrite: boolean; canApprove: boolean } | null = null;
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

  const { data: versions, error: versionsError } = await admin
    .from("deliverable_versions")
    .select("id, deliverable_id, version, version_number, file_url, file_type, duration, notes, created_at, published_at")
    .eq("deliverable_id", resolved.data.deliverable.id)
    .order("version_number", { ascending: false })
    .order("version", { ascending: false })
    .order("created_at", { ascending: false });

  if (versionsError) {
    return NextResponse.json({ error: versionsError.message }, { status: 500 });
  }

  const selectedVersionId = requestedVersionId || versions?.[0]?.id || null;

  const { data: threads, error: threadsError } = selectedVersionId
    ? await admin
        .from("review_threads")
        .select("id, version_id, timecode_seconds, x, y, created_by, created_at, status, resolved_at, resolved_by, review_comments(id, thread_id, body, created_by, guest_name, guest_email, created_at)")
        .eq("version_id", selectedVersionId)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (threadsError) {
    return NextResponse.json({ error: threadsError.message }, { status: 500 });
  }

  const { data: approvals } = await admin
    .from("approvals")
    .select("id, deliverable_id, version_id, deliverable_version_id, decision, approved_at, created_at, note, comment, approved_by, approver_user_id")
    .eq("deliverable_id", resolved.data.deliverable.id)
    .order("approved_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(25);

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

  return NextResponse.json({
    deliverable: resolved.data.deliverable,
    link: {
      id: resolved.data.link.id,
      expiresAt: resolved.data.link.expires_at,
      requireAuth: resolved.data.link.require_auth,
      allowGuestComments: resolved.data.link.allow_guest_comments,
      hasPassword: Boolean(resolved.data.link.password_hash),
      singleUse: resolved.data.link.single_use,
    },
    versions: versions ?? [],
    selectedVersionId,
    threads: (threads ?? []).map((thread) => ({
      ...thread,
      review_comments: [...((thread.review_comments ?? []) as Array<Record<string, unknown>>)].sort(
        (a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime(),
      ),
    })),
    approvals: approvals ?? [],
    access,
  });
}
