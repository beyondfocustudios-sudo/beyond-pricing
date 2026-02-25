// Dropbox API client helper
// Uses refresh token flow: access_token expires in 4h, auto-refresh

const DROPBOX_API = "https://api.dropboxapi.com/2";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

export interface DropboxFile {
  id: string;
  name: string;
  path_display: string;
  size: number;
  ".tag": "file" | "folder";
  server_modified: string;
  client_modified: string;
  content_hash?: string;
}

export interface DropboxListResult {
  entries: DropboxFile[];
  cursor: string;
  has_more: boolean;
}

// ── Refresh token ─────────────────────────────────────────────────────────
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  if (!appKey || !appSecret) throw new Error("Missing Dropbox app credentials");

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    }),
  });
  if (!resp.ok) throw new Error(`Token refresh failed: ${await resp.text()}`);
  return resp.json();
}

// ── List folder (initial) ─────────────────────────────────────────────────
export async function listFolder(
  accessToken: string,
  path: string,
  recursive = true
): Promise<DropboxListResult> {
  const resp = await fetch(`${DROPBOX_API}/files/list_folder`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, recursive, limit: 500 }),
  });
  if (!resp.ok) throw new Error(`list_folder failed: ${await resp.text()}`);
  return resp.json();
}

// ── List folder continue (with cursor) ───────────────────────────────────
export async function listFolderContinue(
  accessToken: string,
  cursor: string
): Promise<DropboxListResult> {
  const resp = await fetch(`${DROPBOX_API}/files/list_folder/continue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cursor }),
  });
  if (!resp.ok) throw new Error(`list_folder/continue failed: ${await resp.text()}`);
  return resp.json();
}

// ── Get latest cursor (without listing) ──────────────────────────────────
export async function getLatestCursor(
  accessToken: string,
  path: string,
  recursive = true
): Promise<string> {
  const resp = await fetch(`${DROPBOX_API}/files/list_folder/get_latest_cursor`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, recursive }),
  });
  if (!resp.ok) throw new Error(`get_latest_cursor failed: ${await resp.text()}`);
  const data = await resp.json() as { cursor: string };
  return data.cursor;
}

// ── Get temporary link for preview/download ──────────────────────────────
export async function getTemporaryLink(accessToken: string, path: string): Promise<string> {
  const resp = await fetch(`${DROPBOX_API}/files/get_temporary_link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  });
  if (!resp.ok) return "";
  const data = await resp.json() as { link: string };
  return data.link;
}

// ── Create folder ───────────────────────────────────────────────────────────
export async function createFolder(accessToken: string, path: string): Promise<{
  id: string;
  path_display: string;
  path_lower: string;
}> {
  const resp = await fetch(`${DROPBOX_API}/files/create_folder_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path,
      autorename: false,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`create_folder_v2 failed: ${text}`);
  }

  const json = (await resp.json()) as {
    metadata?: { id: string; path_display: string; path_lower: string };
  };
  if (!json.metadata?.id) {
    throw new Error("create_folder_v2 returned invalid payload");
  }
  return json.metadata;
}

// ── Create shared link ──────────────────────────────────────────────────────
export async function createSharedLink(accessToken: string, path: string): Promise<string | null> {
  const resp = await fetch(`${DROPBOX_API}/sharing/create_shared_link_with_settings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path,
      settings: {
        requested_visibility: "public",
      },
    }),
  });

  if (resp.ok) {
    const json = (await resp.json()) as { url?: string };
    return json.url ?? null;
  }

  // If link already exists, fetch existing.
  const listResp = await fetch(`${DROPBOX_API}/sharing/list_shared_links`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, direct_only: true }),
  });
  if (!listResp.ok) return null;
  const listJson = (await listResp.json()) as { links?: Array<{ url?: string }> };
  return listJson.links?.[0]?.url ?? null;
}

// ── Smart categorization ──────────────────────────────────────────────────
export function categorizeFile(name: string, path: string): {
  category: string;
  versionLabel: string | null;
  folderPhase: string;
} {
  const upper = name.toUpperCase();
  const pathUpper = path.toUpperCase();

  // Version label
  let versionLabel: string | null = null;
  if (/FINAL/.test(upper)) versionLabel = "FINAL";
  else if (/EXPORT/.test(upper)) versionLabel = "EXPORT";
  else if (/GRADE/.test(upper)) versionLabel = "GRADE";
  else if (/V(\d+)/.test(upper)) versionLabel = upper.match(/V(\d+)/)?.[0] ?? null;

  // Category by extension
  let category = "doc";
  if (/\.(mp4|mov|avi|mkv|mxf|r3d|braw|prores)$/i.test(name)) category = "video";
  else if (/\.(jpg|jpeg|png|gif|webp|tiff|raw|arw|cr2|nef|dng)$/i.test(name)) category = "photo";
  else if (/\.(pdf|docx?|xlsx?|pptx?|txt|md)$/i.test(name)) category = "doc";

  // Override to "final" or "grade" if label matches
  if (versionLabel === "FINAL" || versionLabel === "EXPORT") category = "final";
  if (versionLabel === "GRADE") category = "grade";

  // Folder phase from path
  let folderPhase = "other";
  if (/01[_-]?PRE/i.test(pathUpper) || /PRE[_-]?PRODUCAO/i.test(pathUpper)) folderPhase = "pre";
  else if (/02[_-]?SHOOT/i.test(pathUpper) || /RODAGEM/i.test(pathUpper)) folderPhase = "shoot";
  else if (/03[_-]?POST/i.test(pathUpper) || /POS[_-]?PRODUCAO/i.test(pathUpper)) folderPhase = "post";
  else if (/04[_-]?FINAL/i.test(pathUpper) || /ENTREGA/i.test(pathUpper)) folderPhase = "final";

  return { category, versionLabel, folderPhase };
}
