import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireProjectAccess } from "@/lib/authz";
import {
  refreshAccessToken,
  listFolder,
  listFolderContinue,
  categorizeFile,
  type DropboxFile,
} from "@/lib/dropbox";
import { decryptDropboxToken, encryptDropboxToken } from "@/lib/dropbox-crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

type DropboxConnectionRow = {
  id: string;
  org_id: string | null;
  project_id: string | null;
  account_email: string | null;
  dropbox_account_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  expires_at: string | null;
  cursor: string | null;
  sync_path: string | null;
  last_synced_at: string | null;
  revoked_at: string | null;
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

function inferExt(fileName: string) {
  const parts = fileName.split(".");
  if (parts.length < 2) return "";
  return parts.pop()?.toLowerCase() ?? "";
}

function inferMime(ext: string) {
  const map: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] ?? "application/octet-stream";
}

function inferCollection(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return "Geral";
  return parts[parts.length - 2] ?? "Geral";
}

function toUiFileType(category: string) {
  if (category === "video") return "video";
  if (category === "photo") return "image";
  if (category === "audio") return "audio";
  return "document";
}

async function resolveConnection(projectId: string, userId: string) {
  const service = createServiceClient();

  const { data: team } = await service
    .from("team_members")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();

  const orgId = (team?.org_id as string | null) ?? null;

  if (orgId) {
    const { data } = await service
      .from("dropbox_connections")
      .select("id, org_id, project_id, account_email, dropbox_account_id, access_token, refresh_token, access_token_enc, refresh_token_enc, access_token_encrypted, refresh_token_encrypted, token_expires_at, expires_at, cursor, sync_path, last_synced_at, revoked_at")
      .eq("org_id", orgId)
      .is("project_id", null)
      .is("revoked_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      return { connection: data as DropboxConnectionRow, orgId, service };
    }
  }

  const { data } = await service
    .from("dropbox_connections")
    .select("id, org_id, project_id, account_email, dropbox_account_id, access_token, refresh_token, access_token_enc, refresh_token_enc, access_token_encrypted, refresh_token_encrypted, token_expires_at, expires_at, cursor, sync_path, last_synced_at, revoked_at")
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { connection: (data as DropboxConnectionRow | null) ?? null, orgId, service };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { projectId?: string; path?: string; fullSync?: boolean };
  const projectId = String(body.projectId ?? "").trim();
  const path = String(body.path ?? "").trim();
  const fullSync = Boolean(body.fullSync);

  if (!projectId) {
    return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });
  }

  try {
    await requireProjectAccess(projectId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const resolved = await resolveConnection(projectId, user.id);
  const connection = resolved.connection;
  const service = resolved.service;

  if (!connection) {
    return NextResponse.json({ error: "No Dropbox connection found" }, { status: 404 });
  }

  const { data: projectDropbox } = await service
    .from("project_dropbox")
    .select("root_path, folder_path, deliveries_path")
    .eq("project_id", projectId)
    .maybeSingle();

  const syncPath = path
    || String((projectDropbox as { deliveries_path?: string | null } | null)?.deliveries_path
      ?? (projectDropbox as { folder_path?: string | null } | null)?.folder_path
      ?? projectDropbox?.root_path
      ?? connection.sync_path
      ?? "/");

  let accessToken = pickToken(connection, "access");
  const refreshToken = pickToken(connection, "refresh");

  if (!accessToken) {
    return NextResponse.json({ error: "Dropbox access token inválido" }, { status: 500 });
  }

  const expiresAtRaw = connection.token_expires_at || connection.expires_at;
  if (expiresAtRaw && new Date(expiresAtRaw).getTime() <= Date.now() + 15_000 && refreshToken) {
    const fresh = await refreshAccessToken(refreshToken);
    accessToken = fresh.access_token;
    const tokenExpiresAt = new Date(Date.now() + fresh.expires_in * 1000 - 60_000).toISOString();
    const encryptedAccess = encryptDropboxToken(fresh.access_token);

    await service
      .from("dropbox_connections")
      .update({
        access_token: fresh.access_token,
        access_token_enc: encryptedAccess,
        access_token_encrypted: encryptedAccess,
        token_expires_at: tokenExpiresAt,
        expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
  }

  const { data: logEntry } = await service
    .from("dropbox_sync_log")
    .insert({
      connection_id: connection.id,
      project_id: projectId,
      status: "pending",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  let filesAdded = 0;
  let filesUpdated = 0;

  try {
    let result;
    if (fullSync || !connection.cursor) {
      result = await listFolder(accessToken, syncPath);
    } else {
      result = await listFolderContinue(accessToken, connection.cursor);
    }

    const allFiles: DropboxFile[] = [...result.entries.filter((entry) => entry[".tag"] === "file") as DropboxFile[]];

    while (result.has_more) {
      result = await listFolderContinue(accessToken, result.cursor);
      allFiles.push(...(result.entries.filter((entry) => entry[".tag"] === "file") as DropboxFile[]));
      if (allFiles.length > 5000) break;
    }

    let { data: deliverable } = await service
      .from("deliverables")
      .select("id")
      .eq("project_id", projectId)
      .eq("title", "Dropbox Sync")
      .maybeSingle();

    if (!deliverable?.id) {
      const created = await service
        .from("deliverables")
        .insert({
          project_id: projectId,
          title: "Dropbox Sync",
          file_type: "folder",
          status: "active",
        })
        .select("id")
        .single();

      if (created.error || !created.data?.id) {
        throw new Error(created.error?.message ?? "Não foi possível criar deliverable Dropbox Sync");
      }
      deliverable = created.data;
    }

    for (const file of allFiles) {
      const categorized = categorizeFile(file.name, file.path_display);
      const ext = inferExt(file.name);
      const mimeType = inferMime(ext);
      const collection = inferCollection(file.path_display);

      const { data: existing } = await service
        .from("deliverable_files")
        .select("id")
        .eq("project_id", projectId)
        .eq("dropbox_path", file.path_display)
        .maybeSingle();

      const payload = {
        project_id: projectId,
        deliverable_id: deliverable.id,
        provider: "dropbox",
        provider_id: file.id,
        dropbox_id: file.id,
        path: file.path_display,
        dropbox_path: file.path_display,
        filename: file.name,
        name: file.name,
        ext,
        file_type: toUiFileType(categorized.category),
        mime_type: mimeType,
        mime: mimeType,
        bytes: file.size,
        size: file.size,
        category: categorized.category,
        version_label: categorized.versionLabel,
        folder_phase: categorized.folderPhase,
        collection,
        captured_at: file.server_modified,
        is_deleted: false,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error } = await service.from("deliverable_files").update(payload).eq("id", existing.id);
        if (error) throw new Error(error.message);
        filesUpdated += 1;
      } else {
        const { error } = await service.from("deliverable_files").insert(payload);
        if (error) throw new Error(error.message);
        filesAdded += 1;
      }
    }

    await service
      .from("dropbox_connections")
      .update({
        cursor: result.cursor,
        sync_path: syncPath,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    await service
      .from("project_dropbox")
      .upsert(
        {
          project_id: projectId,
          org_id: resolved.orgId,
          folder_path: syncPath,
          root_path: syncPath,
          deliveries_path: syncPath,
          cursor: result.cursor,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id" },
      );

    if (logEntry?.id) {
      await service
        .from("dropbox_sync_log")
        .update({
          status: "success",
          files_added: filesAdded,
          files_updated: filesUpdated,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logEntry.id);
    }

    return NextResponse.json({
      ok: true,
      filesAdded,
      filesUpdated,
      totalProcessed: allFiles.length,
      syncPath,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";

    if (logEntry?.id) {
      await service
        .from("dropbox_sync_log")
        .update({
          status: "error",
          error_message: msg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logEntry.id);
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 100);

  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  try {
    await requireProjectAccess(projectId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const resolved = await resolveConnection(projectId, user.id);
  const service = resolved.service;
  const conn = resolved.connection
    ? {
        id: resolved.connection.id,
        last_synced_at: resolved.connection.last_synced_at,
        sync_path: resolved.connection.sync_path,
        cursor: resolved.connection.cursor,
        dropbox_account_id: resolved.connection.dropbox_account_id,
        account_email: resolved.connection.account_email,
      }
    : null;

  const { data: logs } = await service
    .from("dropbox_sync_log")
    .select("id, status, files_added, files_updated, files_deleted, error_message, started_at, completed_at")
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(limit);

  return NextResponse.json({ connected: Boolean(conn), connection: conn, logs: logs ?? [] });
}
