import { NextResponse } from "next/server";
import { ensureDropboxRootFolder, DropboxSyncError } from "@/lib/dropbox-folder-sync";
import { requireDropboxManager } from "@/app/api/dropbox/_shared";

export async function POST() {
  const gate = await requireDropboxManager();
  if ("error" in gate) return gate.error;

  try {
    const result = await ensureDropboxRootFolder(gate.user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof DropboxSyncError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && error.message === "DROPBOX_PATH_OUTSIDE_ROOT") {
      return NextResponse.json({ error: "DROPBOX_PATH_OUTSIDE_ROOT", code: "DROPBOX_PATH_OUTSIDE_ROOT" }, { status: 400 });
    }
    return NextResponse.json({ error: "Falha ao garantir root Dropbox" }, { status: 500 });
  }
}
