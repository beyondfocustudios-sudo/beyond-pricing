import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireProjectAccess } from "@/lib/authz";
import { refreshAccessToken, getTemporaryLink } from "@/lib/dropbox";
import { decryptDropboxToken, encryptDropboxToken } from "@/lib/dropbox-crypto";
import { getDemoFileById } from "@/lib/dropbox-demo";
import { assertInsideRoot, normalizeRoot } from "@/lib/dropboxPaths";

type DropboxConnectionRow = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  expires_at: string | null;
  org_id: string | null;
  project_id: string | null;
  revoked_at: string | null;
};

function pickToken(row: DropboxConnectionRow, kind: "access" | "refresh") {
  if (kind === "access") {
    if (row.access_token_enc) {
      try {
        return decryptDropboxToken(row.access_token_enc);
      } catch {
        // continue
      }
    }
    if (row.access_token_encrypted) {
      try {
        return decryptDropboxToken(row.access_token_encrypted);
      } catch {
        // continue
      }
    }
    return row.access_token ?? null;
  }

  if (row.refresh_token_enc) {
    try {
      return decryptDropboxToken(row.refresh_token_enc);
    } catch {
      // continue
    }
  }
  if (row.refresh_token_encrypted) {
    try {
      return decryptDropboxToken(row.refresh_token_encrypted);
    } catch {
      // continue
    }
  }
  return row.refresh_token ?? null;
}

async function loadConnectionForProject(projectId: string, userId: string) {
  const service = createServiceClient();

  const { data: team } = await service
    .from("team_members")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();

  const orgId = (team?.org_id as string | null) ?? null;

  if (orgId) {
    const { data: byOrg } = await service
      .from("dropbox_connections")
      .select("id, access_token, refresh_token, access_token_enc, refresh_token_enc, access_token_encrypted, refresh_token_encrypted, token_expires_at, expires_at, org_id, project_id, revoked_at")
      .eq("org_id", orgId)
      .is("project_id", null)
      .is("revoked_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byOrg) return { row: byOrg as DropboxConnectionRow, orgId, service };
  }

  const { data: byProject } = await service
    .from("dropbox_connections")
    .select("id, access_token, refresh_token, access_token_enc, refresh_token_enc, access_token_encrypted, refresh_token_encrypted, token_expires_at, expires_at, org_id, project_id, revoked_at")
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byProject) return { row: byProject as DropboxConnectionRow, orgId, service };
  return { row: null, orgId, service };
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({} as { fileId?: string; mode?: "preview" | "download" }));
  const fileId = String(payload.fileId ?? "").trim();
  if (!fileId) {
    return NextResponse.json({ error: "fileId obrigatório" }, { status: 400 });
  }

  const demo = getDemoFileById(fileId);
  if (demo) {
    return NextResponse.json({ ok: true, url: demo.url, demo: true, mode: payload.mode ?? "download" });
  }

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: file } = await service
    .from("deliverable_files")
    .select("id, project_id, dropbox_path, preview_url, shared_link")
    .eq("id", fileId)
    .maybeSingle();

  if (!file?.project_id) {
    return NextResponse.json({ error: "Ficheiro não encontrado" }, { status: 404 });
  }

  try {
    await requireProjectAccess(String(file.project_id));
  } catch {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  }

  if (file.preview_url || file.shared_link) {
    return NextResponse.json({ ok: true, url: file.preview_url || file.shared_link });
  }

  if (!file.dropbox_path) {
    return NextResponse.json({ error: "Ficheiro sem caminho Dropbox" }, { status: 404 });
  }

  const conn = await loadConnectionForProject(String(file.project_id), user.id);
  if (!conn.row) {
    return NextResponse.json({ error: "Dropbox não conectado" }, { status: 404 });
  }

  let rootPath: string | null = null;
  if (conn.orgId) {
    const settingsRes = await conn.service
      .from("org_settings")
      .select("dropbox_root_path")
      .eq("org_id", conn.orgId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const rootRaw = String((settingsRes.data as { dropbox_root_path?: string | null } | null)?.dropbox_root_path ?? "").trim();
    if (rootRaw) rootPath = normalizeRoot(rootRaw);
  }
  if (!rootPath) {
    return NextResponse.json({ error: "Root Dropbox não configurado." }, { status: 409 });
  }

  let accessToken = pickToken(conn.row, "access");
  const refreshToken = pickToken(conn.row, "refresh");
  const expiresAtRaw = conn.row.token_expires_at || conn.row.expires_at;

  if (!accessToken) {
    return NextResponse.json({ error: "Token Dropbox inválido" }, { status: 500 });
  }

  if (expiresAtRaw && new Date(expiresAtRaw).getTime() <= Date.now() + 15_000 && refreshToken) {
    const fresh = await refreshAccessToken(refreshToken);
    accessToken = fresh.access_token;
    const tokenExpiresAt = new Date(Date.now() + fresh.expires_in * 1000 - 60_000).toISOString();
    const encAccess = encryptDropboxToken(fresh.access_token);

    await conn.service
      .from("dropbox_connections")
      .update({
        access_token: fresh.access_token,
        access_token_enc: encAccess,
        access_token_encrypted: encAccess,
        token_expires_at: tokenExpiresAt,
        expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.row.id);
  }

  const safePath = assertInsideRoot(rootPath, String(file.dropbox_path));
  const temporaryLink = await getTemporaryLink(accessToken, safePath);
  if (!temporaryLink) {
    return NextResponse.json({ error: "Não foi possível gerar link temporário" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: temporaryLink, mode: payload.mode ?? "download" });
}
