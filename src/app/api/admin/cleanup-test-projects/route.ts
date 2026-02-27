import { NextResponse } from "next/server";
import { requireInsightsAdmin } from "@/app/api/insights/_lib";
import { createServiceClient } from "@/lib/supabase/service";

type ProjectRow = {
  id: string;
  project_name: string | null;
  client_id?: string | null;
  client_name?: string | null;
  calc?: { preco_recomendado?: number } | null;
};

type SupabaseError = {
  code?: string;
  message?: string;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function isMissingRelationOrColumn(error: SupabaseError | null | undefined) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "42703" || error.code === "PGRST205") return true;
  return /does not exist|could not find|column/i.test(error.message ?? "");
}

function isForeignKeyError(error: SupabaseError | null | undefined) {
  if (!error) return false;
  return error.code === "23503";
}

function shouldCleanupProject(project: ProjectRow) {
  const name = normalize(project.project_name);
  const isNovoProjeto = name === "novo projeto" || name.includes("novo projeto");
  const hasClientId = Boolean(project.client_id);
  const hasClientName = normalize(project.client_name).length > 0;
  const total = Number(project.calc?.preco_recomendado ?? 0);
  const isEmptyTestProject = !hasClientId && !hasClientName && total <= 0;
  return isNovoProjeto || isEmptyTestProject;
}

async function safeDeleteByColumn(
  admin: ReturnType<typeof createServiceClient>,
  table: string,
  column: string,
  ids: string[],
) {
  if (ids.length === 0) return;
  const { error } = await admin.from(table).delete().in(column, ids);
  if (error && !isMissingRelationOrColumn(error)) {
    throw new Error(`[${table}.${column}] ${error.message}`);
  }
}

async function deleteDependents(admin: ReturnType<typeof createServiceClient>, projectIds: string[]) {
  await safeDeleteByColumn(admin, "tasks", "project_id", projectIds);
  await safeDeleteByColumn(admin, "call_sheets", "project_id", projectIds);
  await safeDeleteByColumn(admin, "project_dropbox", "project_id", projectIds);
  await safeDeleteByColumn(admin, "deliverable_files", "project_id", projectIds);
  await safeDeleteByColumn(admin, "journal_entries", "project_id", projectIds);
  await safeDeleteByColumn(admin, "logistics_routes", "project_id", projectIds);
  await safeDeleteByColumn(admin, "project_members", "project_id", projectIds);

  const checklistRes = await admin
    .from("checklists")
    .select("id")
    .in("project_id", projectIds)
    .limit(2000);
  if (!checklistRes.error) {
    const checklistIds = (checklistRes.data ?? []).map((row) => String((row as { id: string }).id));
    await safeDeleteByColumn(admin, "checklist_items", "checklist_id", checklistIds);
    await safeDeleteByColumn(admin, "checklists", "id", checklistIds);
  } else if (!isMissingRelationOrColumn(checklistRes.error)) {
    throw new Error(`[checklists] ${checklistRes.error.message}`);
  }

  const conversationsRes = await admin
    .from("conversations")
    .select("id")
    .in("project_id", projectIds)
    .limit(1000);
  if (!conversationsRes.error) {
    const conversationIds = (conversationsRes.data ?? []).map((row) => String((row as { id: string }).id));
    await safeDeleteByColumn(admin, "messages", "conversation_id", conversationIds);
    await safeDeleteByColumn(admin, "conversations", "id", conversationIds);
  } else if (!isMissingRelationOrColumn(conversationsRes.error)) {
    throw new Error(`[conversations] ${conversationsRes.error.message}`);
  }

  const deliverablesRes = await admin
    .from("deliverables")
    .select("id")
    .in("project_id", projectIds)
    .limit(1000);
  if (!deliverablesRes.error) {
    const deliverableIds = (deliverablesRes.data ?? []).map((row) => String((row as { id: string }).id));

    if (deliverableIds.length > 0) {
      const versionsRes = await admin
        .from("deliverable_versions")
        .select("id")
        .in("deliverable_id", deliverableIds)
        .limit(2000);

      if (!versionsRes.error) {
        const versionIds = (versionsRes.data ?? []).map((row) => String((row as { id: string }).id));
        if (versionIds.length > 0) {
          const threadsRes = await admin
            .from("review_threads")
            .select("id")
            .in("version_id", versionIds)
            .limit(4000);

          if (!threadsRes.error) {
            const threadIds = (threadsRes.data ?? []).map((row) => String((row as { id: string }).id));
            await safeDeleteByColumn(admin, "review_comments", "thread_id", threadIds);
            await safeDeleteByColumn(admin, "review_threads", "id", threadIds);
          } else if (!isMissingRelationOrColumn(threadsRes.error)) {
            throw new Error(`[review_threads] ${threadsRes.error.message}`);
          }

          await safeDeleteByColumn(admin, "approvals", "version_id", versionIds);
          await safeDeleteByColumn(admin, "deliverable_versions", "id", versionIds);
        }
      } else if (!isMissingRelationOrColumn(versionsRes.error)) {
        throw new Error(`[deliverable_versions] ${versionsRes.error.message}`);
      }

      await safeDeleteByColumn(admin, "deliverables", "id", deliverableIds);
    }
  } else if (!isMissingRelationOrColumn(deliverablesRes.error)) {
    throw new Error(`[deliverables] ${deliverablesRes.error.message}`);
  }
}

export async function POST(req: Request) {
  try {
    await requireInsightsAdmin();
  } catch (error) {
    const code = error instanceof Error ? error.message : "FORBIDDEN";
    if (code === "NOT_AUTHENTICATED") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.json({ error: "Acesso negado (admin)" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { confirm?: boolean };
  if (!body.confirm) {
    return NextResponse.json({ error: "Confirmação obrigatória" }, { status: 400 });
  }

  const admin = createServiceClient();

  const primary = await admin
    .from("projects")
    .select("id, project_name, client_id, client_name, calc")
    .order("created_at", { ascending: false })
    .limit(1000);

  let rows: ProjectRow[] = [];
  if (primary.error && isMissingRelationOrColumn(primary.error)) {
    const fallback = await admin
      .from("projects")
      .select("id, project_name, client_name, calc")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }
    rows = (fallback.data ?? []) as ProjectRow[];
  } else if (primary.error) {
    return NextResponse.json({ error: primary.error.message }, { status: 500 });
  } else {
    rows = (primary.data ?? []) as ProjectRow[];
  }

  const candidateIds = rows.filter(shouldCleanupProject).map((project) => project.id);
  if (candidateIds.length === 0) {
    return NextResponse.json({ ok: true, affected: 0, message: "Sem projetos de teste para limpar." });
  }

  let deletedCount = 0;
  const firstAttempt = await admin.from("projects").delete({ count: "exact" }).in("id", candidateIds);

  if (firstAttempt.error && isForeignKeyError(firstAttempt.error)) {
    try {
      await deleteDependents(admin, candidateIds);
    } catch (dependencyError) {
      return NextResponse.json({
        error: dependencyError instanceof Error ? dependencyError.message : "Falha ao limpar dependências",
      }, { status: 500 });
    }

    const secondAttempt = await admin.from("projects").delete({ count: "exact" }).in("id", candidateIds);
    if (secondAttempt.error) {
      return NextResponse.json({ error: secondAttempt.error.message }, { status: 500 });
    }
    deletedCount = secondAttempt.count ?? candidateIds.length;
  } else if (firstAttempt.error) {
    return NextResponse.json({ error: firstAttempt.error.message }, { status: 500 });
  } else {
    deletedCount = firstAttempt.count ?? candidateIds.length;
  }

  return NextResponse.json({
    ok: true,
    affected: deletedCount,
    message: `Limpeza concluída: ${deletedCount} projetos de teste removidos definitivamente.`,
  });
}
