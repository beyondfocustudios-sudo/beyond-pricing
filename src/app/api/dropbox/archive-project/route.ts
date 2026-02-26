import { NextRequest, NextResponse } from "next/server";
import { archiveProjectDropboxFolder, DropboxSyncError } from "@/lib/dropbox-folder-sync";
import { requireDropboxManager } from "@/app/api/dropbox/_shared";

export async function POST(request: NextRequest) {
  const gate = await requireDropboxManager();
  if ("error" in gate) return gate.error;

  const body = (await request.json().catch(() => ({}))) as { projectId?: string };
  const projectId = String(body.projectId ?? "").trim();
  if (!projectId) {
    return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });
  }

  try {
    const result = await archiveProjectDropboxFolder(gate.user.id, projectId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof DropboxSyncError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Falha ao arquivar pasta Dropbox do projeto" }, { status: 500 });
  }
}
