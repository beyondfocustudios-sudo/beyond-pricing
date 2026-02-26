import { NextRequest, NextResponse } from "next/server";
import { ensureClientDropboxFolder, DropboxSyncError } from "@/lib/dropbox-folder-sync";
import { requireDropboxManager } from "@/app/api/dropbox/_shared";

export async function POST(request: NextRequest) {
  const gate = await requireDropboxManager();
  if ("error" in gate) return gate.error;

  const body = (await request.json().catch(() => ({}))) as { clientId?: string };
  const clientId = String(body.clientId ?? "").trim();
  if (!clientId) {
    return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  }

  try {
    const result = await ensureClientDropboxFolder(gate.user.id, clientId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof DropboxSyncError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Falha ao garantir pasta do cliente" }, { status: 500 });
  }
}
