import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveProjectManageAccess } from "@/lib/project-access";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  if (!projectId) {
    return NextResponse.json({ error: "Project ID obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const access = await resolveProjectManageAccess(projectId, user.id);
  if (!access.ok) {
    if (access.reason === "not_found") {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  if (access.project.deleted_at) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  const now = new Date().toISOString();

  const { data, error } = await access.admin
    .from("projects")
    .update({
      deleted_at: now,
      status: "arquivado",
      updated_at: now,
    })
    .eq("id", projectId)
    .select("id, deleted_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, project: data });
}
