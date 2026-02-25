import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { getProjectAccess, getProjectForDeliverable } from "@/lib/review-auth";
import { createReviewToken, hashReviewPassword, hashReviewToken } from "@/lib/review-links";
import { logReviewAudit } from "@/lib/review-events";

export async function GET(request: NextRequest) {
  const deliverableId = request.nextUrl.searchParams.get("deliverableId");
  if (!deliverableId) {
    return NextResponse.json({ error: "deliverableId obrigatório" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("review_links")
    .select("id, deliverable_id, expires_at, require_auth, single_use, allow_guest_comments, use_count, used_at, created_at")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ links: data ?? [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    deliverableId?: string;
    expiresInDays?: number;
    password?: string;
    singleUse?: boolean;
    requireAuth?: boolean;
    allowGuestComments?: boolean;
  };

  const deliverableId = String(body.deliverableId ?? "").trim();
  if (!deliverableId) {
    return NextResponse.json({ error: "deliverableId obrigatório" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const expiresInDays = Math.max(1, Math.min(30, Number(body.expiresInDays ?? 7)));
  const token = createReviewToken();
  const tokenHash = hashReviewToken(token);

  const password = String(body.password ?? "").trim();
  const passwordHash = password ? hashReviewPassword(password) : null;

  const admin = createServiceClient();
  const { data: link, error } = await admin
    .from("review_links")
    .insert({
      deliverable_id: deliverableId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
      password_hash: passwordHash,
      require_auth: Boolean(body.requireAuth),
      single_use: Boolean(body.singleUse),
      allow_guest_comments: body.allowGuestComments !== false,
      created_by: user.id,
    })
    .select("id, deliverable_id, expires_at, require_auth, single_use, allow_guest_comments, created_at")
    .single();

  if (error || !link) {
    return NextResponse.json({ error: error?.message ?? "Falha ao criar link" }, { status: 500 });
  }

  await logReviewAudit({
    actorId: user.id,
    action: "review.link.create",
    entityType: "review_links",
    entityId: link.id,
    payload: {
      deliverable_id: deliverableId,
      project_id: deliverableRef.project.id,
      expires_at: link.expires_at,
      require_auth: link.require_auth,
      single_use: link.single_use,
      allow_guest_comments: link.allow_guest_comments,
    },
  });

  const shareUrl = `${request.nextUrl.origin}/review-link/${token}`;
  return NextResponse.json({
    link,
    shareUrl,
  }, { status: 201 });
}
