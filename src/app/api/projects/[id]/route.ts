import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveProjectManageAccess } from "@/lib/project-access";
import { archiveProjectDropboxFolder } from "@/lib/dropbox-folder-sync";

async function requireAccess(projectId: string) {
  if (!projectId) {
    return { error: NextResponse.json({ error: "Project ID obrigatório" }, { status: 400 }) } as const;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) } as const;
  }

  const access = await resolveProjectManageAccess(projectId, user.id);
  if (!access.ok) {
    if (access.reason === "not_found") {
      return { error: NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 }) } as const;
    }
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) } as const;
  }

  return { access, userId: user.id } as const;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const gate = await requireAccess(projectId);
  if ("error" in gate) return gate.error;

  const body = (await request.json().catch(() => ({}))) as { action?: "archive"; status?: string };
  const now = new Date().toISOString();

  if (body.action === "archive") {
    let dropboxArchived = false;
    try {
      await archiveProjectDropboxFolder(gate.userId, projectId);
      dropboxArchived = true;
    } catch {
      // Non-blocking for project archive action.
    }

    const { data, error } = await gate.access.admin
      .from("projects")
      .update({
        status: "archived",
        archived_at: now,
        updated_at: now,
      })
      .eq("id", projectId)
      .select("id, status, archived_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, project: data, dropboxArchived });
  }

  if (body.status) {
    const allowed = new Set(["draft", "sent", "in_review", "approved", "cancelled", "archived"]);
    const nextStatus = String(body.status).toLowerCase();
    if (!allowed.has(nextStatus)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    const { data, error } = await gate.access.admin
      .from("projects")
      .update({
        status: nextStatus,
        archived_at: nextStatus === "archived" ? now : null,
        updated_at: now,
      })
      .eq("id", projectId)
      .select("id, status, archived_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (nextStatus === "archived") {
      try {
        await archiveProjectDropboxFolder(gate.userId, projectId);
      } catch {
        // Non-blocking.
      }
    }

    return NextResponse.json({ ok: true, project: data });
  }

  return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const gate = await requireAccess(projectId);
  if ("error" in gate) return gate.error;

  if (gate.access.project.deleted_at) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  const now = new Date().toISOString();

  let dropboxArchived = false;
  try {
    await archiveProjectDropboxFolder(gate.userId, projectId);
    dropboxArchived = true;
  } catch {
    // Non-blocking soft delete.
  }

  const { data, error } = await gate.access.admin
    .from("projects")
    .update({
      deleted_at: now,
      status: "archived",
      archived_at: now,
      updated_at: now,
    })
    .eq("id", projectId)
    .select("id, deleted_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, project: data, dropboxArchived });
}
