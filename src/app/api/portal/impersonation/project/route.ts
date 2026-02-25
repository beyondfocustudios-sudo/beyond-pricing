import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  requireOwnerAdminUser,
  resolvePortalImpersonationContext,
} from "@/lib/portal-impersonation";

function extractLinks(input: string | null | undefined) {
  if (!input) return [];
  const matches = input.match(/https?:\/\/[^\s)]+/gi) ?? [];
  return Array.from(new Set(matches.map((item) => item.trim())));
}

export async function GET(request: NextRequest) {
  const auth = await requireOwnerAdminUser();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const token = request.nextUrl.searchParams.get("token") ?? "";
  const projectId = request.nextUrl.searchParams.get("projectId") ?? "";

  if (!projectId) {
    return NextResponse.json({ error: "projectId em falta." }, { status: 400 });
  }

  const resolved = await resolvePortalImpersonationContext(token, {
    enforceAdminUserId: auth.user.id,
  });

  if (!resolved.context) {
    return NextResponse.json({ error: resolved.error ?? "Token inválido." }, { status: resolved.status ?? 400 });
  }

  const admin = createServiceClient();

  const { data: project } = await admin
    .from("projects")
    .select("id, project_name, client_name, status, updated_at, created_at, client_id, inputs, shoot_days")
    .eq("id", projectId)
    .eq("client_id", resolved.context.clientId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const [milestonesResult, deliverablesResult, filesResult, requestsResult, briefResult, conversationResult] = await Promise.all([
    admin
      .from("project_milestones")
      .select("id, project_id, title, phase, status, progress_percent, due_date, description, completed_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("due_date", { ascending: true }),
    admin
      .from("deliverables")
      .select("id, project_id, title, status, description, created_at, updated_at, dropbox_url")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin
      .from("deliverable_files")
      .select("id, project_id, deliverable_id, filename, file_type, mime, ext, bytes, shared_link, preview_url, created_at, metadata")
      .eq("project_id", projectId)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .order("created_at", { ascending: false }),
    admin
      .from("client_requests")
      .select("id, project_id, title, description, type, priority, status, deadline, created_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin
      .from("briefs")
      .select("referencias, observacoes")
      .eq("project_id", projectId)
      .maybeSingle(),
    admin
      .from("conversations")
      .select("id")
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);

  const deliverableIds = (deliverablesResult.data ?? []).map((row) => String(row.id));
  const approvalsResult = deliverableIds.length
    ? await admin
        .from("approvals")
        .select("id, deliverable_id, decision, note, comment, approved_at, created_at")
        .in("deliverable_id", deliverableIds)
        .order("created_at", { ascending: false })
    : { data: [] as Array<Record<string, unknown>> };

  const conversationId = conversationResult.data?.id ? String(conversationResult.data.id) : null;

  const messagesResult = conversationId
    ? await admin
        .from("messages")
        .select("id, sender_type, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
    : { data: [] as Array<Record<string, unknown>> };

  const inputsObject = (project.inputs as Record<string, unknown> | null) ?? null;
  const inputDescription = typeof inputsObject?.descricao === "string" ? inputsObject.descricao : null;
  const inputNotes = typeof inputsObject?.observacoes === "string" ? inputsObject.observacoes : null;

  const references = Array.from(new Set([
    ...extractLinks(briefResult.data?.referencias ?? null),
    ...extractLinks(briefResult.data?.observacoes ?? null),
    ...extractLinks(inputDescription),
    ...extractLinks(inputNotes),
  ]));

  return NextResponse.json({
    ok: true,
    impersonation: {
      clientId: resolved.context.clientId,
      clientName: resolved.context.clientName,
      expiresAt: resolved.context.expiresAt,
    },
    project,
    milestones: milestonesResult.data ?? [],
    deliverables: deliverablesResult.data ?? [],
    files: filesResult.data ?? [],
    requests: requestsResult.data ?? [],
    approvals: approvalsResult.data ?? [],
    conversationId,
    messages: messagesResult.data ?? [],
    references,
  });
}
