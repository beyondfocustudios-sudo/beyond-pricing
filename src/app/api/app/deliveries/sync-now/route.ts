import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as { projectId?: string; fullSync?: boolean }));
  const projectId = String(body.projectId ?? "").trim();
  if (!projectId) {
    return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });
  }

  try {
    await requireProjectAccess(projectId);
  } catch {
    return NextResponse.json({ error: "Sem acesso ao projeto" }, { status: 403 });
  }

  const syncResponse = await fetch(new URL("/api/dropbox/sync", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") ?? "" },
    body: JSON.stringify({ projectId, fullSync: Boolean(body.fullSync) }),
    cache: "no-store",
  });

  const payload = await syncResponse.json().catch(() => ({} as { error?: string }));
  if (!syncResponse.ok) {
    return NextResponse.json({ error: payload.error ?? "Falha ao sincronizar entregas" }, { status: syncResponse.status });
  }

  return NextResponse.json({ ok: true, ...payload });
}

