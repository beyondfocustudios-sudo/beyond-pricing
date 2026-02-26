import { NextRequest, NextResponse } from "next/server";
import { moveDropboxFolder, DropboxSyncError } from "@/lib/dropbox-folder-sync";
import { requireDropboxManager } from "@/app/api/dropbox/_shared";

export async function POST(request: NextRequest) {
  const gate = await requireDropboxManager(true);
  if ("error" in gate) return gate.error;

  const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = String(body.from ?? "").trim();
  const to = String(body.to ?? "").trim();
  if (!from || !to) {
    return NextResponse.json({ error: "from e to são obrigatórios" }, { status: 400 });
  }

  try {
    const result = await moveDropboxFolder(gate.user.id, from, to);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof DropboxSyncError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && error.message === "DROPBOX_PATH_OUTSIDE_ROOT") {
      return NextResponse.json({ error: "DROPBOX_PATH_OUTSIDE_ROOT", code: "DROPBOX_PATH_OUTSIDE_ROOT" }, { status: 400 });
    }
    return NextResponse.json({ error: "Falha ao mover pasta Dropbox" }, { status: 500 });
  }
}
