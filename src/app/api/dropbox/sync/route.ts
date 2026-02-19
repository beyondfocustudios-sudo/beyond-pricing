// ============================================================
// /api/dropbox/sync?projectId=...
// Internal-only: syncs Dropbox files for a project into
// deliverable_files table.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  getAccessToken,
  listFolder,
  listFolderContinue,
  inferFileType,
  inferCollection,
  createSharedLink,
} from "@/lib/dropbox";

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const sb = await createClient();

  // Auth check
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check user is internal member of this project
  const { data: member } = await sb
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!member || !["owner", "admin", "editor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get project_dropbox config
  const { data: pd, error: pdErr } = await sb
    .from("project_dropbox")
    .select("*")
    .eq("project_id", projectId)
    .single();

  if (pdErr || !pd) {
    return NextResponse.json(
      { error: "No Dropbox path configured for this project" },
      { status: 404 }
    );
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (e) {
    return NextResponse.json(
      { error: "Dropbox not configured: " + (e as Error).message },
      { status: 503 }
    );
  }

  const rootPath: string = pd.root_path;
  let cursor: string | null = pd.cursor ?? null;
  let newFiles = 0;
  let updatedFiles = 0;

  try {
    // Use cursor if we have one (incremental), otherwise full listing
    let result = cursor
      ? await listFolderContinue(token, cursor)
      : await listFolder(token, rootPath);

    async function processEntries(entries: typeof result.entries) {
      for (const entry of entries) {
        if (entry[".tag"] !== "file") continue;

        const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
        const fileType = inferFileType(entry.name);
        const collection = inferCollection(rootPath, entry.path_display);

        // Generate shared link (non-blocking best-effort)
        let sharedLink: string | null = null;
        try {
          sharedLink = await createSharedLink(token, entry.path_lower);
        } catch {
          // ignore — link will be null
        }

        // Upsert into deliverable_files
        const { error: upsertErr, data: upserted } = await sb
          .from("deliverable_files")
          .upsert(
            {
              project_id: projectId,
              dropbox_path: entry.path_lower,
              filename: entry.name,
              ext,
              file_type: fileType,
              collection,
              bytes: entry.size ?? null,
              shared_link: sharedLink,
              captured_at: entry.client_modified ?? null,
              metadata: {},
            },
            { onConflict: "project_id,dropbox_path", ignoreDuplicates: false }
          )
          .select("id")
          .single();

        if (!upsertErr && upserted) {
          newFiles++;
        } else if (upsertErr) {
          updatedFiles++;
        }
      }
    }

    await processEntries(result.entries);

    while (result.has_more) {
      result = await listFolderContinue(token, result.cursor);
      await processEntries(result.entries);
    }

    cursor = result.cursor;
  } catch (e) {
    return NextResponse.json(
      { error: "Dropbox sync error: " + (e as Error).message },
      { status: 502 }
    );
  }

  // Update cursor + last_sync_at
  await sb
    .from("project_dropbox")
    .update({ cursor, last_sync_at: new Date().toISOString() })
    .eq("project_id", projectId);

  // Audit log
  await sb.from("audit_log").insert({
    actor_user_id: user.id,
    action: "dropbox.sync",
    entity: "project_dropbox",
    entity_id: projectId,
    meta: { new_files: newFiles, updated_files: updatedFiles, root_path: rootPath },
  });

  return NextResponse.json({
    ok: true,
    synced: newFiles + updatedFiles,
    new: newFiles,
    updated: updatedFiles,
    cursor,
  });
}

// GET is also supported (same logic, just for convenience)
export const GET = POST;
