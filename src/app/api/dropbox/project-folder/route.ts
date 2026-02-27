import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveProjectManageAccess } from "@/lib/project-access";
import { createFolder, createSharedLink, refreshAccessToken } from "@/lib/dropbox";
import { decryptDropboxToken, encryptDropboxToken } from "@/lib/dropbox-crypto";
import { assertInsideRoot, clientPath, join as joinDropboxPath, normalizeRoot, projectPath } from "@/lib/dropboxPaths";

function sanitizeFolderName(value: string) {
  return value
    .replace(/[\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function ensureSubfolder(accessToken: string, path: string) {
  try {
    await createFolder(accessToken, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (!/conflict|already exists|path\/conflict/i.test(message)) {
      throw error;
    }
  }
}

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
};

function pickToken(row: DropboxConnectionRow, kind: "access" | "refresh") {
  if (kind === "access") {
    if (row.access_token_enc) {
      try {
        return decryptDropboxToken(row.access_token_enc);
      } catch {
        // noop
      }
    }
    if (row.access_token_encrypted) {
      try {
        return decryptDropboxToken(row.access_token_encrypted);
      } catch {
        // noop
      }
    }
    return row.access_token ?? null;
  }

  if (row.refresh_token_enc) {
    try {
      return decryptDropboxToken(row.refresh_token_enc);
    } catch {
      // noop
    }
  }
  if (row.refresh_token_encrypted) {
    try {
      return decryptDropboxToken(row.refresh_token_encrypted);
    } catch {
      // noop
    }
  }
  return row.refresh_token ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      projectId?: string;
      folderName?: string;
      clientName?: string;
      projectName?: string;
    };

    const projectId = String(body.projectId ?? "").trim();
    const folderName = sanitizeFolderName(String(body.folderName ?? ""));

    if (!projectId || !folderName) {
      return NextResponse.json({ error: "projectId e folderName são obrigatórios" }, { status: 400 });
    }

    const access = await resolveProjectManageAccess(projectId, user.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.reason === "not_found" ? "Projeto não encontrado" : "Sem permissão" }, { status: access.reason === "not_found" ? 404 : 403 });
    }

    const admin = createServiceClient();

    const { data: teamRow } = await admin
    .from("team_members")
    .select("org_id")
    .eq("user_id", user.id)
    .maybeSingle();
    const orgId = (teamRow?.org_id as string | null) ?? null;

    let orgConnection: DropboxConnectionRow | null = null;
    if (orgId) {
    const { data } = await admin
      .from("dropbox_connections")
      .select("id, access_token, refresh_token, access_token_enc, refresh_token_enc, access_token_encrypted, refresh_token_encrypted, token_expires_at, expires_at")
      .eq("org_id", orgId)
      .is("project_id", null)
      .is("revoked_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    orgConnection = (data as DropboxConnectionRow | null) ?? null;
    }

    const { data: projectConnection } = await admin
    .from("dropbox_connections")
    .select("id, access_token, refresh_token, access_token_enc, refresh_token_enc, access_token_encrypted, refresh_token_encrypted, token_expires_at, expires_at")
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

    const connection = (orgConnection ?? projectConnection) as DropboxConnectionRow | null;

    if (!connection) {
      return NextResponse.json({ error: "Liga primeiro a conta Dropbox deste projeto." }, { status: 400 });
    }

    let accessToken = pickToken(connection, "access") ?? "";
    const refreshToken = pickToken(connection, "refresh") ?? "";
    const tokenExpiresAt = String(connection.token_expires_at ?? connection.expires_at ?? "");

    if (tokenExpiresAt && new Date(tokenExpiresAt).getTime() <= Date.now() && refreshToken) {
    const fresh = await refreshAccessToken(refreshToken);
    accessToken = fresh.access_token;
    const encryptedToken = encryptDropboxToken(fresh.access_token);
    await admin
      .from("dropbox_connections")
      .update({
        access_token: fresh.access_token,
        access_token_enc: encryptedToken,
        access_token_encrypted: encryptedToken,
        token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
      })
      .eq("id", connection.id as string);
    }

    const { data: settings } = await admin
    .from("org_settings")
    .select("dropbox_root_path")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
    const rootRaw = String((settings as { dropbox_root_path?: string | null } | null)?.dropbox_root_path ?? "").trim();
    if (!rootRaw) {
      return NextResponse.json({ error: "Root Dropbox não configurado. Define em /app/integrations." }, { status: 409 });
    }
    const rootPath = normalizeRoot(rootRaw);

    const { data: projectRow } = await admin
    .from("projects")
    .select("project_name, client_name")
    .eq("id", projectId)
    .maybeSingle();
    const clientName = String(body.clientName ?? projectRow?.client_name ?? "").trim() || "cliente";
    const projectName = String(body.projectName ?? projectRow?.project_name ?? folderName).trim() || folderName;
    const fullPath = assertInsideRoot(rootPath, projectPath(rootPath, clientName, projectName));

    let folderId: string | null = null;
    let pathDisplay = fullPath;

    try {
      const created = await createFolder(accessToken, fullPath);
      folderId = created.id;
      pathDisplay = created.path_display;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro a criar pasta";
      if (!/conflict|already exists/i.test(message)) {
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }
    

    pathDisplay = assertInsideRoot(rootPath, pathDisplay);
    const deliveriesPath = assertInsideRoot(rootPath, joinDropboxPath(pathDisplay, "01_Entregas"));
    const folderUrl = await createSharedLink(accessToken, pathDisplay);
    await Promise.all([
      ensureSubfolder(accessToken, assertInsideRoot(rootPath, joinDropboxPath(pathDisplay, "01_Entregas"))),
      ensureSubfolder(accessToken, assertInsideRoot(rootPath, joinDropboxPath(pathDisplay, "02_Brief"))),
      ensureSubfolder(accessToken, assertInsideRoot(rootPath, joinDropboxPath(pathDisplay, "03_Referencias"))),
      ensureSubfolder(accessToken, assertInsideRoot(rootPath, joinDropboxPath(pathDisplay, "04_Assets"))),
      ensureSubfolder(accessToken, assertInsideRoot(rootPath, joinDropboxPath(pathDisplay, "99_Archive"))),
    ]);
    const deliveriesUrl = await createSharedLink(accessToken, deliveriesPath);

    const { error: upsertError } = await admin
    .from("project_dropbox")
    .upsert(
      {
        project_id: projectId,
        folder_path: pathDisplay,
        root_path: pathDisplay,
        deliveries_path: deliveriesPath,
        base_path: clientPath(rootPath, clientName),
        folder_id: folderId,
        folder_url: folderUrl,
        deliveries_url: deliveriesUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      path: pathDisplay,
      deliveriesPath,
      folderId,
      folderUrl,
      deliveriesUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro a configurar pasta Dropbox";
    if (message === "DROPBOX_PATH_OUTSIDE_ROOT") {
      return NextResponse.json({ error: "DROPBOX_PATH_OUTSIDE_ROOT", code: "DROPBOX_PATH_OUTSIDE_ROOT" }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
