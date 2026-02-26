import { createServiceClient } from "@/lib/supabase/service";
import { slugify } from "@/lib/utils";
import {
  createFolder,
  createSharedLink,
  deletePath,
  getMetadata,
  movePath,
  refreshAccessToken,
} from "@/lib/dropbox";
import { decryptDropboxToken, encryptDropboxToken } from "@/lib/dropbox-crypto";
import {
  assertInsideRoot,
  clientPath,
  DEFAULT_DROPBOX_ROOT,
  join as joinDropboxPath,
  normalizeRoot,
  projectPath,
} from "@/lib/dropboxPaths";

const DEFAULT_PROJECT_SUBFOLDERS = [
  "01_Entregas",
  "02_Brief",
  "03_Referencias",
  "04_Assets",
  "99_Archive",
] as const;

type TeamContext = {
  orgId: string;
  role: string;
};

type DropboxConnectionRow = {
  id: string;
  org_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  expires_at: string | null;
};

type DropboxOrgContext = {
  actorUserId: string;
  orgId: string;
  role: string;
  accessToken: string;
  admin: ReturnType<typeof createServiceClient>;
};

type ClientFolderResult = {
  clientId: string;
  clientSlug: string;
  rootPath: string;
  folderPath: string;
  folderUrl: string | null;
};

type ProjectFolderResult = {
  projectId: string;
  projectSlug: string;
  rootPath: string;
  folderPath: string;
  deliveriesPath: string;
  folderUrl: string | null;
  deliveriesUrl: string | null;
};

type DropboxPathFixResult = {
  projectDropboxFixed: number;
  deliverableFilesFixed: number;
  connectionsFixed: number;
};

export class DropboxSyncError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function normalizeDropboxPath(path: string | null | undefined, fallback?: string) {
  const raw = String(path ?? "").trim();
  const base = raw || String(fallback ?? "").trim();
  if (!base) {
    throw new DropboxSyncError("dropbox_root_missing", "Root Dropbox não configurado", 409);
  }
  const withSlash = base.startsWith("/") ? base : `/${base}`;
  const cleaned = withSlash.replace(/\/{2,}/g, "/");
  if (cleaned === "/") return "/";
  return cleaned.replace(/\/+$/, "");
}

function sanitizeSlug(value: string, fallback: string) {
  const slug = slugify(value);
  return slug || fallback;
}

function remapIntoRoot(rootPath: string, value: string | null | undefined) {
  const root = normalizeRoot(rootPath);
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.startsWith("/") ? raw.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/" : `/${raw}`;
  if (normalized === root || normalized.startsWith(`${root}/`)) return normalized;
  if (!normalized.startsWith("/")) return null;
  if (normalized === "/") return root;
  return joinDropboxPath(root, normalized.replace(/^\/+/, ""));
}

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

async function logDropboxAudit(
  admin: ReturnType<typeof createServiceClient>,
  actorUserId: string,
  action: string,
  payload: Record<string, unknown>,
) {
  const attempts: Array<Record<string, unknown>> = [
    {
      actor_id: actorUserId,
      action,
      entity_type: "dropbox",
      payload,
    },
    {
      actor_user_id: actorUserId,
      action,
      entity: "dropbox",
      meta: payload,
    },
    {
      user_id: actorUserId,
      action,
      table_name: "dropbox",
      new_data: payload,
    },
  ];

  for (const row of attempts) {
    const { error } = await admin.from("audit_log").insert(row);
    if (!error) return;
  }
}

async function resolveTeamContext(
  admin: ReturnType<typeof createServiceClient>,
  actorUserId: string,
) {
  const { data, error } = await admin
    .from("team_members")
    .select("org_id, role")
    .eq("user_id", actorUserId)
    .maybeSingle();

  if (error) {
    throw new DropboxSyncError("team_lookup_failed", error.message, 500);
  }

  const orgId = String((data as { org_id?: string } | null)?.org_id ?? "");
  const role = String((data as { role?: string } | null)?.role ?? "").toLowerCase();

  if (!orgId) {
    throw new DropboxSyncError("org_missing", "Org não encontrada para utilizador", 400);
  }

  if (!role || role === "client_viewer" || role === "client_approver") {
    throw new DropboxSyncError("forbidden", "Sem permissão para gerir Dropbox", 403);
  }

  return { orgId, role } satisfies TeamContext;
}

async function resolveDropboxConnection(
  admin: ReturnType<typeof createServiceClient>,
  team: TeamContext,
) {
  const { data, error } = await admin
    .from("dropbox_connections")
    .select("id, org_id, access_token, refresh_token, access_token_enc, refresh_token_enc, access_token_encrypted, refresh_token_encrypted, token_expires_at, expires_at")
    .eq("org_id", team.orgId)
    .is("project_id", null)
    .is("revoked_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new DropboxSyncError("dropbox_connection_lookup_failed", error.message, 500);
  }

  const connection = (data as DropboxConnectionRow | null) ?? null;
  if (!connection) {
    throw new DropboxSyncError("dropbox_not_connected", "Dropbox não conectado para a organização", 404);
  }

  let accessToken = pickToken(connection, "access");
  const refreshToken = pickToken(connection, "refresh");
  if (!accessToken) {
    throw new DropboxSyncError("dropbox_token_missing", "Token Dropbox inválido", 500);
  }

  const expiresRaw = connection.token_expires_at ?? connection.expires_at;
  if (expiresRaw && new Date(expiresRaw).getTime() <= Date.now() + 15_000 && refreshToken) {
    const fresh = await refreshAccessToken(refreshToken);
    accessToken = fresh.access_token;
    const tokenExpiresAt = new Date(Date.now() + fresh.expires_in * 1000 - 60_000).toISOString();
    const encrypted = encryptDropboxToken(fresh.access_token);

    const { error: updateError } = await admin
      .from("dropbox_connections")
      .update({
        access_token: fresh.access_token,
        access_token_enc: encrypted,
        access_token_encrypted: encrypted,
        token_expires_at: tokenExpiresAt,
        expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    if (updateError) {
      throw new DropboxSyncError("dropbox_token_refresh_save_failed", updateError.message, 500);
    }
  }

  return { connection, accessToken };
}

async function ensurePathExists(accessToken: string, rootPath: string, fullPath: string) {
  const root = normalizeRoot(rootPath);
  const target = assertInsideRoot(root, normalizeDropboxPath(fullPath, root));

  const parts = target.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    assertInsideRoot(root, current);
    try {
      await createFolder(accessToken, current);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (/conflict|already exists|path\/conflict/i.test(message)) {
        continue;
      }
      throw error;
    }
  }

  return target;
}

async function movePathIdempotent(accessToken: string, rootPath: string, fromPath: string, toPath: string) {
  const root = normalizeRoot(rootPath);
  const from = assertInsideRoot(root, normalizeDropboxPath(fromPath, root));
  const to = assertInsideRoot(root, normalizeDropboxPath(toPath, root));
  if (from === to) return to;

  try {
    await movePath(accessToken, from, to);
    return to;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    const targetMeta = await getMetadata(accessToken, to);
    if (targetMeta) return targetMeta.path_display;
    if (/not_found|path_lookup\/not_found/i.test(message)) {
      return to;
    }
    throw error;
  }
}

async function ensureOrgSettingsRootPath(
  admin: ReturnType<typeof createServiceClient>,
  orgId: string,
) {
  const { data, error } = await admin
    .from("org_settings")
    .select("id, key, dropbox_root_path")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new DropboxSyncError("org_settings_read_failed", error.message, 500);
  }

  const existing = data as { id?: string; key?: string; dropbox_root_path?: string | null } | null;
  const rootPath = normalizeRoot(String(existing?.dropbox_root_path ?? DEFAULT_DROPBOX_ROOT));
  if (existing?.id) {
    const { error: updateError } = await admin
      .from("org_settings")
      .update({ dropbox_root_path: rootPath, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updateError) {
      throw new DropboxSyncError("org_settings_update_failed", updateError.message, 500);
    }
    return rootPath;
  }

  const key = `dropbox_root_${orgId}`;
  const { error: insertError } = await admin
    .from("org_settings")
    .insert({
      org_id: orgId,
      key,
      value: {},
      dropbox_root_path: rootPath,
      updated_at: new Date().toISOString(),
    });

  if (insertError && !/duplicate key/i.test(insertError.message)) {
    throw new DropboxSyncError("org_settings_insert_failed", insertError.message, 500);
  }

  return rootPath;
}

async function buildOrgContext(actorUserId: string, requireAdmin = false) {
  const admin = createServiceClient();
  const team = await resolveTeamContext(admin, actorUserId);
  if (requireAdmin && team.role !== "owner" && team.role !== "admin") {
    throw new DropboxSyncError("forbidden", "Apenas owner/admin", 403);
  }
  const { accessToken } = await resolveDropboxConnection(admin, team);
  return {
    actorUserId,
    orgId: team.orgId,
    role: team.role,
    accessToken,
    admin,
  } satisfies DropboxOrgContext;
}

async function autoFixPathsOutsideRoot(ctx: DropboxOrgContext, rootPath: string) {
  const root = normalizeRoot(rootPath);
  let projectDropboxFixed = 0;
  let deliverableFilesFixed = 0;
  let connectionsFixed = 0;

  const { data: connections } = await ctx.admin
    .from("dropbox_connections")
    .select("id, sync_path")
    .eq("org_id", ctx.orgId)
    .is("project_id", null)
    .is("revoked_at", null);

  for (const row of connections ?? []) {
    const nextSync = remapIntoRoot(root, (row as { sync_path?: string | null }).sync_path ?? root);
    if (nextSync && nextSync !== (row as { sync_path?: string | null }).sync_path) {
      const { error } = await ctx.admin
        .from("dropbox_connections")
        .update({ sync_path: nextSync, updated_at: new Date().toISOString() })
        .eq("id", (row as { id: string }).id);
      if (!error) connectionsFixed += 1;
    }
  }

  const { data: projectRows } = await ctx.admin
    .from("project_dropbox")
    .select("project_id, folder_path, root_path, deliveries_path, base_path")
    .eq("org_id", ctx.orgId);

  const projectIds: string[] = [];
  for (const row of projectRows ?? []) {
    const current = row as {
      project_id: string;
      folder_path?: string | null;
      root_path?: string | null;
      deliveries_path?: string | null;
      base_path?: string | null;
    };
    const nextFolder = remapIntoRoot(root, current.folder_path ?? current.root_path ?? null);
    const nextRoot = remapIntoRoot(root, current.root_path ?? current.folder_path ?? null);
    const nextDeliveries = remapIntoRoot(root, current.deliveries_path ?? (nextFolder ? joinDropboxPath(nextFolder, "01_Entregas") : null));
    const nextBase = remapIntoRoot(root, current.base_path ?? root) ?? root;

    if (
      nextFolder && nextRoot && nextDeliveries
      && (nextFolder !== (current.folder_path ?? null)
        || nextRoot !== (current.root_path ?? null)
        || nextDeliveries !== (current.deliveries_path ?? null)
        || nextBase !== (current.base_path ?? null))
    ) {
      const { error } = await ctx.admin
        .from("project_dropbox")
        .update({
          folder_path: nextFolder,
          root_path: nextRoot,
          deliveries_path: nextDeliveries,
          base_path: nextBase,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", current.project_id);
      if (!error) {
        projectDropboxFixed += 1;
      }
    }
    if (current.project_id) projectIds.push(current.project_id);
  }

  if (projectIds.length > 0) {
    const { data: files } = await ctx.admin
      .from("deliverable_files")
      .select("id, dropbox_path, project_id")
      .in("project_id", projectIds);

    for (const file of files ?? []) {
      const current = file as { id: string; dropbox_path?: string | null };
      const nextPath = remapIntoRoot(root, current.dropbox_path ?? null);
      if (nextPath && nextPath !== (current.dropbox_path ?? null)) {
        const { error } = await ctx.admin
          .from("deliverable_files")
          .update({ dropbox_path: nextPath, updated_at: new Date().toISOString() })
          .eq("id", current.id);
        if (!error) deliverableFilesFixed += 1;
      }
    }
  }

  return { projectDropboxFixed, deliverableFilesFixed, connectionsFixed } satisfies DropboxPathFixResult;
}

async function ensureClientFolderWithContext(
  ctx: DropboxOrgContext,
  clientId: string,
) {
  const { data: client, error: clientError } = await ctx.admin
    .from("clients")
    .select("id, name, slug, dropbox_folder_path")
    .eq("id", clientId)
    .maybeSingle();

  if (clientError) {
    throw new DropboxSyncError("client_read_failed", clientError.message, 500);
  }
  if (!client?.id) {
    throw new DropboxSyncError("client_not_found", "Cliente não encontrado", 404);
  }

  const rootPath = await ensureOrgSettingsRootPath(ctx.admin, ctx.orgId);
  await ensurePathExists(ctx.accessToken, rootPath, rootPath);

  const desiredSlug = sanitizeSlug(String(client.slug ?? client.name ?? ""), `cliente-${String(client.id).slice(0, 8)}`);
  const targetPath = clientPath(rootPath, desiredSlug);
  const currentPath = normalizeDropboxPath(client.dropbox_folder_path ?? "", targetPath);

  if (client.dropbox_folder_path && normalizeDropboxPath(client.dropbox_folder_path) !== targetPath) {
    await movePathIdempotent(ctx.accessToken, rootPath, currentPath, targetPath);
  } else {
    await ensurePathExists(ctx.accessToken, rootPath, targetPath);
  }

  const folderUrl = await createSharedLink(ctx.accessToken, assertInsideRoot(rootPath, targetPath));

  const { error: updateClientError } = await ctx.admin
    .from("clients")
    .update({
      slug: desiredSlug,
      dropbox_folder_path: targetPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId);

  if (updateClientError) {
    throw new DropboxSyncError("client_update_failed", updateClientError.message, 500);
  }

  if (client.dropbox_folder_path && normalizeDropboxPath(client.dropbox_folder_path) !== targetPath) {
    const { data: projects } = await ctx.admin
      .from("projects")
      .select("id")
      .eq("client_id", clientId)
      .is("deleted_at", null);

    const projectIds = (projects ?? []).map((project) => project.id).filter(Boolean);
    if (projectIds.length > 0) {
      const { data: rows } = await ctx.admin
        .from("project_dropbox")
        .select("project_id, folder_path, root_path, deliveries_path")
        .in("project_id", projectIds);

      for (const row of rows ?? []) {
        const oldPrefix = normalizeDropboxPath(client.dropbox_folder_path, rootPath);
        const nextFolder = String(row.folder_path ?? row.root_path ?? "")
          .replace(oldPrefix, targetPath);
        const nextDeliveries = String(row.deliveries_path ?? "")
          .replace(oldPrefix, targetPath);

        await ctx.admin
          .from("project_dropbox")
          .update({
            folder_path: assertInsideRoot(rootPath, normalizeDropboxPath(nextFolder, targetPath)),
            root_path: assertInsideRoot(rootPath, normalizeDropboxPath(nextFolder, targetPath)),
            deliveries_path: assertInsideRoot(rootPath, normalizeDropboxPath(nextDeliveries, joinDropboxPath(targetPath, "01_Entregas"))),
            updated_at: new Date().toISOString(),
          })
          .eq("project_id", row.project_id);
      }
    }
  }

  return {
    clientId,
    clientSlug: desiredSlug,
    rootPath,
    folderPath: targetPath,
    folderUrl,
  } satisfies ClientFolderResult;
}

function getParentPath(path: string) {
  const normalized = normalizeDropboxPath(path);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return `/${parts.slice(0, -1).join("/")}`;
}

function getPathLeaf(path: string) {
  const normalized = normalizeDropboxPath(path);
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function formatArchiveSuffix() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}Z`;
}

async function ensureProjectFolderWithContext(
  ctx: DropboxOrgContext,
  projectId: string,
) {
  const { data: project, error: projectError } = await ctx.admin
    .from("projects")
    .select("id, project_name, client_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new DropboxSyncError("project_read_failed", projectError.message, 500);
  }
  if (!project?.id) {
    throw new DropboxSyncError("project_not_found", "Projeto não encontrado", 404);
  }
  if (!project.client_id) {
    throw new DropboxSyncError("project_missing_client", "Projeto sem cliente associado", 409);
  }

  const clientFolder = await ensureClientFolderWithContext(ctx, String(project.client_id));
  const projectSlug = sanitizeSlug(String(project.project_name ?? ""), `project-${String(project.id).slice(0, 8)}`);
  const targetProjectPath = projectPath(clientFolder.rootPath, clientFolder.clientSlug, projectSlug);
  const targetDeliveries = joinDropboxPath(targetProjectPath, "01_Entregas");

  const { data: row } = await ctx.admin
    .from("project_dropbox")
    .select("project_id, folder_path, root_path")
    .eq("project_id", projectId)
    .maybeSingle();

  const existingPath = normalizeDropboxPath(
    String((row as { folder_path?: string | null; root_path?: string | null } | null)?.folder_path
      ?? (row as { folder_path?: string | null; root_path?: string | null } | null)?.root_path
      ?? ""),
    targetProjectPath,
  );

  if (row?.project_id && existingPath !== targetProjectPath) {
    await movePathIdempotent(ctx.accessToken, clientFolder.rootPath, existingPath, targetProjectPath);
  } else {
    await ensurePathExists(ctx.accessToken, clientFolder.rootPath, targetProjectPath);
  }

  for (const folder of DEFAULT_PROJECT_SUBFOLDERS) {
    await ensurePathExists(ctx.accessToken, clientFolder.rootPath, joinDropboxPath(targetProjectPath, folder));
  }

  const [folderUrl, deliveriesUrl] = await Promise.all([
    createSharedLink(ctx.accessToken, assertInsideRoot(clientFolder.rootPath, targetProjectPath)),
    createSharedLink(ctx.accessToken, assertInsideRoot(clientFolder.rootPath, targetDeliveries)),
  ]);

  const nowIso = new Date().toISOString();
  const { error: upsertError } = await ctx.admin
    .from("project_dropbox")
    .upsert(
      {
        project_id: projectId,
        org_id: ctx.orgId,
        base_path: clientFolder.folderPath,
        folder_path: targetProjectPath,
        root_path: targetProjectPath,
        deliveries_path: targetDeliveries,
        folder_url: folderUrl,
        deliveries_url: deliveriesUrl,
        archived_at: null,
        updated_at: nowIso,
      },
      { onConflict: "project_id" },
    );

  if (upsertError) {
    throw new DropboxSyncError("project_dropbox_upsert_failed", upsertError.message, 500);
  }

  return {
    projectId,
    projectSlug,
    rootPath: clientFolder.rootPath,
    folderPath: targetProjectPath,
    deliveriesPath: targetDeliveries,
    folderUrl,
    deliveriesUrl,
  } satisfies ProjectFolderResult;
}

export async function ensureDropboxRootFolder(actorUserId: string) {
  const ctx = await buildOrgContext(actorUserId);
  try {
    const rootPath = await ensureOrgSettingsRootPath(ctx.admin, ctx.orgId);
    await ensurePathExists(ctx.accessToken, rootPath, rootPath);
    const fixed = await autoFixPathsOutsideRoot(ctx, rootPath);
    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.ensure_root", { orgId: ctx.orgId, rootPath, fixed });
    return { orgId: ctx.orgId, rootPath, fixed };
  } catch (error) {
    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.ensure_root_failed", {
      orgId: ctx.orgId,
      error: error instanceof Error ? error.message : String(error ?? "unknown"),
    });
    throw error;
  }
}

export async function ensureClientDropboxFolder(actorUserId: string, clientId: string) {
  const ctx = await buildOrgContext(actorUserId);
  try {
    const result = await ensureClientFolderWithContext(ctx, clientId);
    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.ensure_client_folder", result);
    return result;
  } catch (error) {
    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.ensure_client_folder_failed", {
      clientId,
      error: error instanceof Error ? error.message : String(error ?? "unknown"),
    });
    throw error;
  }
}

export async function ensureProjectDropboxFolder(actorUserId: string, projectId: string) {
  const ctx = await buildOrgContext(actorUserId);
  try {
    const result = await ensureProjectFolderWithContext(ctx, projectId);
    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.ensure_project_folder", result);
    return result;
  } catch (error) {
    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.ensure_project_folder_failed", {
      projectId,
      error: error instanceof Error ? error.message : String(error ?? "unknown"),
    });
    throw error;
  }
}

export async function moveDropboxFolder(actorUserId: string, fromPath: string, toPath: string) {
  const ctx = await buildOrgContext(actorUserId, true);
  const rootPath = await ensureOrgSettingsRootPath(ctx.admin, ctx.orgId);
  const from = assertInsideRoot(rootPath, normalizeDropboxPath(fromPath, rootPath));
  const to = assertInsideRoot(rootPath, normalizeDropboxPath(toPath, rootPath));
  try {
    await ensurePathExists(ctx.accessToken, rootPath, getParentPath(to));
    const finalPath = await movePathIdempotent(ctx.accessToken, rootPath, from, to);
    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.move_folder", { from, to: finalPath });
    return { from, to: finalPath };
  } catch (error) {
    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.move_folder_failed", {
      from,
      to,
      error: error instanceof Error ? error.message : String(error ?? "unknown"),
    });
    throw error;
  }
}

export async function archiveProjectDropboxFolder(actorUserId: string, projectId: string) {
  const ctx = await buildOrgContext(actorUserId);
  try {
    const { data: project, error: projectError } = await ctx.admin
    .from("projects")
    .select("id, project_name, client_id")
    .eq("id", projectId)
    .maybeSingle();
    if (projectError) {
      throw new DropboxSyncError("project_read_failed", projectError.message, 500);
    }
    if (!project?.id) {
      throw new DropboxSyncError("project_not_found", "Projeto não encontrado", 404);
    }
    if (!project.client_id) {
      throw new DropboxSyncError("project_missing_client", "Projeto sem cliente associado", 409);
    }

    const clientFolder = await ensureClientFolderWithContext(ctx, String(project.client_id));
    const projectSlug = sanitizeSlug(String(project.project_name ?? ""), `project-${String(project.id).slice(0, 8)}`);

    const { data: projectDropbox } = await ctx.admin
      .from("project_dropbox")
      .select("folder_path, root_path")
      .eq("project_id", projectId)
      .maybeSingle();

    const sourcePath = assertInsideRoot(clientFolder.rootPath, normalizeDropboxPath(
      String((projectDropbox as { folder_path?: string | null; root_path?: string | null } | null)?.folder_path
        ?? (projectDropbox as { folder_path?: string | null; root_path?: string | null } | null)?.root_path
        ?? joinDropboxPath(clientFolder.folderPath, projectSlug)),
    ));

    const sourceAlreadyArchived = sourcePath.includes("/99_Archive/");
    if (!sourceAlreadyArchived && !projectDropbox) {
      await ensurePathExists(ctx.accessToken, clientFolder.rootPath, sourcePath);
    }

    const clientBasePath = getParentPath(sourcePath);
    const archiveBase = assertInsideRoot(clientFolder.rootPath, joinDropboxPath(clientBasePath, "99_Archive"));
    await ensurePathExists(ctx.accessToken, clientFolder.rootPath, archiveBase);

    const archivedPath = sourceAlreadyArchived
      ? sourcePath
      : joinDropboxPath(
          archiveBase,
          `${getPathLeaf(sourcePath)}_${formatArchiveSuffix()}`,
        );
    const finalPath = sourceAlreadyArchived
      ? sourcePath
      : await movePathIdempotent(ctx.accessToken, clientFolder.rootPath, sourcePath, archivedPath);
    const deliveriesPath = joinDropboxPath(finalPath, "01_Entregas");
    const nowIso = new Date().toISOString();

    await ctx.admin
      .from("project_dropbox")
      .upsert(
        {
          project_id: projectId,
          org_id: ctx.orgId,
          base_path: archiveBase,
          folder_path: finalPath,
          root_path: finalPath,
          deliveries_path: deliveriesPath,
          archived_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "project_id" },
      );

    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.archive_project", {
      projectId,
      from: sourcePath,
      to: finalPath,
    });

    return {
      projectId,
      archivedPath: finalPath,
      deliveriesPath,
    };
  } catch (error) {
    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.archive_project_failed", {
      projectId,
      error: error instanceof Error ? error.message : String(error ?? "unknown"),
    });
    throw error;
  }
}

export async function hardDeleteDropboxFolder(actorUserId: string, path: string) {
  const ctx = await buildOrgContext(actorUserId, true);
  const rootPath = await ensureOrgSettingsRootPath(ctx.admin, ctx.orgId);
  const normalizedPath = assertInsideRoot(rootPath, normalizeDropboxPath(path, rootPath));
  if (!normalizedPath || normalizedPath === "/") {
    throw new DropboxSyncError("invalid_path", "Path inválido para apagar", 400);
  }

  try {
    await deletePath(ctx.accessToken, normalizedPath);
    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.hard_delete_folder", { path: normalizedPath });
    return { path: normalizedPath };
  } catch (error) {
    await logDropboxAudit(ctx.admin, actorUserId, "dropbox.hard_delete_folder_failed", {
      path: normalizedPath,
      error: error instanceof Error ? error.message : String(error ?? "unknown"),
    });
    throw error;
  }
}
