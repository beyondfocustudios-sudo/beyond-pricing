import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  fetchClientProjectsForPortal,
  requireOwnerAdminUser,
  resolvePortalImpersonationContext,
} from "@/lib/portal-impersonation";

export async function GET(request: NextRequest) {
  const auth = await requireOwnerAdminUser();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const token = request.nextUrl.searchParams.get("token") ?? "";
  const resolved = await resolvePortalImpersonationContext(token, {
    enforceAdminUserId: auth.user.id,
  });

  if (!resolved.context) {
    return NextResponse.json({ error: resolved.error ?? "Token inválido." }, { status: resolved.status ?? 400 });
  }

  const admin = createServiceClient();
  const projects = await fetchClientProjectsForPortal(admin, resolved.context.clientId);
  const projectIds = projects.map((project) => project.id);

  const [milestonesResult, deliverablesResult, convResult] = await Promise.all([
    projectIds.length
      ? admin
          .from("project_milestones")
          .select("id, project_id, title, phase, status, due_date")
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("due_date", { ascending: true })
          .limit(8)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    projectIds.length
      ? admin
          .from("deliverables")
          .select("id, project_id, title, status, created_at")
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    admin
      .from("conversations")
      .select("id, project_id")
      .in("project_id", projectIds.length > 0 ? projectIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(20),
  ]);

  const conversationIds = (convResult.data ?? []).map((row) => String(row.id));

  const messagesResult = conversationIds.length
    ? await admin
        .from("messages")
        .select("id, conversation_id, body, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: [] as Array<Record<string, unknown>> };

  const convProjectById = new Map(
    (convResult.data ?? []).map((row) => [String(row.id), String(row.project_id)]),
  );

  return NextResponse.json({
    ok: true,
    client: {
      id: resolved.context.clientId,
      name: resolved.context.clientName,
      expiresAt: resolved.context.expiresAt,
    },
    projects,
    upcomingMilestones: milestonesResult.data ?? [],
    latestDeliverables: deliverablesResult.data ?? [],
    latestMessages: (messagesResult.data ?? []).map((row) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      project_id: convProjectById.get(String(row.conversation_id)) ?? null,
      body: row.body,
      created_at: row.created_at,
    })),
  });
}
