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

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json() as { projectId: string; path?: string; fullSync?: boolean };
  const { projectId, path = "/", fullSync = false } = body;

  try { await requireProjectAccess(projectId); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const service = createServiceClient();

  // Get connection
  const { data: conn } = await supabase
    .from("dropbox_connections")
    .select("*")
    .eq("project_id", projectId)
    .single();

  if (!conn) return NextResponse.json({ error: "No Dropbox connection found" }, { status: 404 });

  let accessToken = conn.access_token as string;

  // Refresh token if expired
  if (conn.token_expires_at && new Date(conn.token_expires_at as string) <= new Date()) {
    const fresh = await refreshAccessToken(conn.refresh_token as string);
    accessToken = fresh.access_token;
    const expiresAt = new Date(Date.now() + fresh.expires_in * 1000).toISOString();
    await service.from("dropbox_connections").update({ access_token: accessToken, token_expires_at: expiresAt }).eq("id", conn.id);
  }

  // Start sync log
  const { data: logEntry } = await service.from("dropbox_sync_log").insert({
    connection_id: conn.id,
    project_id: projectId,
    status: "pending",
  }).select().single();

  let filesAdded = 0;
  let filesUpdated = 0;
  let allFiles: DropboxFile[] = [];

  try {
    // Full sync or incremental
    let result: Awaited<ReturnType<typeof listFolder>>;
    const syncPath = (conn.sync_path as string) ?? path;

    if (fullSync || !conn.cursor) {
      result = await listFolder(accessToken, syncPath);
    } else {
      result = await listFolderContinue(accessToken, conn.cursor as string);
    }

    allFiles = result.entries.filter(e => e[".tag"] === "file") as DropboxFile[];

    // Paginate if has_more
    while (result.has_more) {
      result = await listFolderContinue(accessToken, result.cursor);
      allFiles.push(...result.entries.filter(e => e[".tag"] === "file") as DropboxFile[]);
      if (allFiles.length > 2000) break; // Safety limit
    }

    // Get or create deliverable for this project
    let { data: deliverable } = await supabase
      .from("deliverables")
      .select("id")
      .eq("project_id", projectId)
      .eq("title", "Dropbox Sync")
      .single();

    if (!deliverable) {
      const { data: newDel } = await service.from("deliverables").insert({
        project_id: projectId,
        title: "Dropbox Sync",
        file_type: "folder",
        status: "active",
      }).select().single();
      deliverable = newDel;
    }

    if (!deliverable) throw new Error("Could not create/find deliverable");

    // Upsert files
    for (const file of allFiles) {
      const { category, versionLabel, folderPhase } = categorizeFile(file.name, file.path_display);

      const { data: existing } = await supabase
        .from("deliverable_files")
        .select("id, file_name")
        .eq("deliverable_id", deliverable.id)
        .eq("dropbox_id", file.id)
        .single();

      if (existing) {
        await service.from("deliverable_files").update({
          file_name: file.name,
          file_size: file.size,
          category,
          version_label: versionLabel,
          folder_phase: folderPhase,
          dropbox_path: file.path_display,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
        filesUpdated++;
      } else {
        await service.from("deliverable_files").insert({
          deliverable_id: deliverable.id,
          file_name: file.name,
          file_size: file.size,
          mime_type: null,
          dropbox_id: file.id,
          dropbox_path: file.path_display,
          category,
          version_label: versionLabel,
          folder_phase: folderPhase,
        });
        filesAdded++;
      }
    }

    // Save cursor for next incremental sync
    await service.from("dropbox_connections").update({
      cursor: result.cursor,
      last_synced_at: new Date().toISOString(),
    }).eq("id", conn.id);

    // Update log
    if (logEntry) {
      await service.from("dropbox_sync_log").update({
        status: "success",
        files_added: filesAdded,
        files_updated: filesUpdated,
        completed_at: new Date().toISOString(),
      }).eq("id", logEntry.id);
    }

    return NextResponse.json({
      ok: true,
      filesAdded,
      filesUpdated,
      totalProcessed: allFiles.length,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (logEntry) {
      await service.from("dropbox_sync_log").update({
        status: "error",
        error_message: msg,
        completed_at: new Date().toISOString(),
      }).eq("id", logEntry.id);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET - get connection status + recent sync log
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 100);
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  try { await requireProjectAccess(projectId); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: conn } = await supabase
    .from("dropbox_connections")
    .select("id, last_synced_at, sync_path, cursor, dropbox_account_id")
    .eq("project_id", projectId)
    .single();

  const { data: logs } = await supabase
    .from("dropbox_sync_log")
    .select("*")
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(limit);

  return NextResponse.json({ connected: !!conn, connection: conn, logs });
}
