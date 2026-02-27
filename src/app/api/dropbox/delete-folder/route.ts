import { NextRequest, NextResponse } from "next/server";
import { hardDeleteDropboxFolder, DropboxSyncError } from "@/lib/dropbox-folder-sync";
import { requireDropboxManager } from "@/app/api/dropbox/_shared";

export async function POST(request: NextRequest) {
  const gate = await requireDropboxManager(true);
  if ("error" in gate) return gate.error;

  const body = (await request.json().catch(() => ({}))) as {
    path?: string;
    confirmIrreversible?: boolean;
  };
  const path = String(body.path ?? "").trim();
  if (!path) {
    return NextResponse.json({ error: "path obrigatório" }, { status: 400 });
  }
  if (body.confirmIrreversible !== true) {
    return NextResponse.json({ error: "Confirmação obrigatória para hard delete" }, { status: 400 });
  }

  try {
    const result = await hardDeleteDropboxFolder(gate.user.id, path);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof DropboxSyncError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && error.message === "DROPBOX_PATH_OUTSIDE_ROOT") {
      return NextResponse.json({ error: "DROPBOX_PATH_OUTSIDE_ROOT", code: "DROPBOX_PATH_OUTSIDE_ROOT" }, { status: 400 });
    }
    return NextResponse.json({ error: "Falha ao apagar pasta Dropbox" }, { status: 500 });
  }
}
