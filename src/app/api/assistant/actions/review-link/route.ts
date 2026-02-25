import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAssistantSettings } from "@/lib/hq-assistant";
import { getProjectAccess } from "@/lib/review-auth";
import { createReviewToken, hashReviewToken } from "@/lib/review-links";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { projectId?: string; expiresInDays?: number };
  const projectId = String(body.projectId ?? "").trim();

  if (!projectId) {
    return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const settings = await getAssistantSettings(supabase);
  if (!settings.enableHqAssistant) {
    return NextResponse.json({ error: "HQ Assistant desativado" }, { status: 403 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, user_id, owner_user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  const access = await getProjectAccess(supabase, {
    id: String(project.id),
    client_id: (project.client_id as string | null) ?? null,
    user_id: (project.user_id as string | null) ?? null,
    owner_user_id: (project.owner_user_id as string | null) ?? null,
  }, user.id);

  if (!access.canWrite) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { data: deliverable } = await supabase
    .from("deliverables")
    .select("id")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!deliverable?.id) {
    return NextResponse.json({ error: "Sem entregáveis neste projeto" }, { status: 404 });
  }

  const token = createReviewToken();
  const tokenHash = hashReviewToken(token);
  const expiresInDays = Math.max(1, Math.min(30, Number(body.expiresInDays ?? 7)));

  const admin = createServiceClient();
  const { data: link, error: linkError } = await admin
    .from("review_links")
    .insert({
      deliverable_id: deliverable.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
      require_auth: false,
      single_use: false,
      allow_guest_comments: true,
      created_by: user.id,
    })
    .select("id, deliverable_id, expires_at")
    .single();

  if (linkError || !link) {
    return NextResponse.json({ error: linkError?.message ?? "Falha a criar link" }, { status: 500 });
  }

  const shareUrl = `${request.nextUrl.origin}/review-link/${token}`;

  return NextResponse.json({
    link,
    shareUrl,
    deliverableId: deliverable.id,
  });
}
