// ============================================================
// Beyond Pricing — Dropbox API integration
// ============================================================
// Uses refresh-token flow to avoid token expiration.
// Tokens read from env; optionally stored in Supabase.
// ============================================================

const DROPBOX_API = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT = "https://content.dropboxapi.com/2";

// ── Extensions → file_type ────────────────────────────────────
const PHOTO_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tiff", "bmp", "raw", "arw", "cr2", "nef", "orf"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "mkv", "mxf", "r3d", "braw", "prores", "m4v", "wmv", "webm"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "aac", "flac", "ogg", "m4a", "aif", "aiff"]);
const DOC_EXTS   = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip", "xml", "json"]);

export type FileType = "photo" | "video" | "audio" | "document" | "other";

export function inferFileType(filename: string, mime?: string | null): FileType {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (PHOTO_EXTS.has(ext) || mime?.startsWith("image/")) return "photo";
  if (VIDEO_EXTS.has(ext) || mime?.startsWith("video/")) return "video";
  if (AUDIO_EXTS.has(ext) || mime?.startsWith("audio/")) return "audio";
  if (DOC_EXTS.has(ext)   || mime === "application/pdf") return "document";
  return "other";
}

// ── Collection heuristic ──────────────────────────────────────
// Extracts the first subfolder after root_path.
// e.g. root=/Beyond/Clients/ACME/ProjectX, path=/Beyond/Clients/ACME/ProjectX/DayOne/img.jpg → "DayOne"
// e.g. path same as root → "Geral"
export function inferCollection(rootPath: string, filePath: string): string {
  const rel = filePath.startsWith(rootPath)
    ? filePath.slice(rootPath.length).replace(/^\//, "")
    : filePath;
  const parts = rel.split("/");
  if (parts.length > 1 && parts[0]) return parts[0];
  return "Geral";
}

// ── Token refresh ─────────────────────────────────────────────
export interface DropboxToken {
  accessToken: string;
  expiresAt?: Date;
}

export async function refreshAccessToken(
  refreshToken: string,
  appKey: string,
  appSecret: string
): Promise<DropboxToken> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: appKey,
    client_secret: appSecret,
  });

  const res = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dropbox token refresh failed: ${err}`);
  }

  const json = await res.json() as { access_token: string; expires_in?: number };
  return {
    accessToken: json.access_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  };
}

// ── Get access token from env ─────────────────────────────────
let _cachedToken: DropboxToken | null = null;

export async function getAccessToken(): Promise<string> {
  const appKey     = process.env.DROPBOX_APP_KEY ?? "";
  const appSecret  = process.env.DROPBOX_APP_SECRET ?? "";
  const refreshTok = process.env.DROPBOX_REFRESH_TOKEN ?? "";

  if (!appKey || !appSecret || !refreshTok) {
    throw new Error(
      "Missing DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN env vars"
    );
  }

  // Reuse cached token if still valid (with 60s buffer)
  if (_cachedToken?.expiresAt && _cachedToken.expiresAt.getTime() > Date.now() + 60_000) {
    return _cachedToken.accessToken;
  }

  _cachedToken = await refreshAccessToken(refreshTok, appKey, appSecret);
  return _cachedToken.accessToken;
}

// ── Dropbox API helpers ───────────────────────────────────────
interface DropboxEntry {
  ".tag": "file" | "folder" | "deleted";
  name: string;
  path_lower: string;
  path_display: string;
  id: string;
  client_modified?: string;
  size?: number;
}

interface ListFolderResult {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
}

export async function listFolder(
  token: string,
  path: string,
  recursive = true
): Promise<ListFolderResult> {
  const res = await fetch(`${DROPBOX_API}/files/list_folder`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: path === "" ? "" : path,
      recursive,
      include_deleted: false,
      include_media_info: true,
    }),
  });
  if (!res.ok) throw new Error(`Dropbox list_folder error: ${await res.text()}`);
  return res.json() as Promise<ListFolderResult>;
}

export async function listFolderContinue(
  token: string,
  cursor: string
): Promise<ListFolderResult> {
  const res = await fetch(`${DROPBOX_API}/files/list_folder/continue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cursor }),
  });
  if (!res.ok) throw new Error(`Dropbox list_folder/continue error: ${await res.text()}`);
  return res.json() as Promise<ListFolderResult>;
}

export async function getLatestCursor(
  token: string,
  path: string,
  recursive = true
): Promise<string> {
  const res = await fetch(`${DROPBOX_API}/files/list_folder/get_latest_cursor`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, recursive }),
  });
  if (!res.ok) throw new Error(`Dropbox get_latest_cursor error: ${await res.text()}`);
  const json = await res.json() as { cursor: string };
  return json.cursor;
}

export async function createSharedLink(
  token: string,
  path: string
): Promise<string | null> {
  // Try to create; if already exists, Dropbox returns an error with the existing link
  const res = await fetch(`${DROPBOX_API}/sharing/create_shared_link_with_settings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path,
      settings: { requested_visibility: "public" },
    }),
  });

  if (res.ok) {
    const json = await res.json() as { url: string };
    // Convert dl=0 to raw download link
    return json.url.replace("?dl=0", "?raw=1");
  }

  // If already shared, extract existing link
  const errBody = await res.json().catch(() => null) as { error?: { shared_link_already_exists?: { metadata?: { url?: string } } } } | null;
  const existing = errBody?.error?.shared_link_already_exists?.metadata?.url;
  if (existing) return existing.replace("?dl=0", "?raw=1");

  return null;
}

export async function getThumbnailUrl(
  token: string,
  path: string
): Promise<string | null> {
  try {
    const res = await fetch(`${DROPBOX_CONTENT}/files/get_thumbnail_v2`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({
          resource: { ".tag": "path", path },
          format: { ".tag": "jpeg" },
          size: { ".tag": "w640h480" },
        }),
      },
    });
    if (!res.ok) return null;
    // Return a temporary link instead (no blob storage needed)
    return null; // thumbnails via shared link are sufficient for now
  } catch {
    return null;
  }
}

export async function getTemporaryLink(
  token: string,
  path: string
): Promise<string | null> {
  try {
    const res = await fetch(`${DROPBOX_API}/files/get_temporary_link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { link: string };
    return json.link;
  } catch {
    return null;
  }
}

// ── Full sync: returns all file entries under path ────────────
export async function* syncFolder(
  token: string,
  rootPath: string,
  cursor?: string
): AsyncGenerator<DropboxEntry> {
  let result: ListFolderResult;

  if (cursor) {
    result = await listFolderContinue(token, cursor);
  } else {
    result = await listFolder(token, rootPath);
  }

  for (const entry of result.entries) {
    if (entry[".tag"] === "file") yield entry;
  }

  while (result.has_more) {
    result = await listFolderContinue(token, result.cursor);
    for (const entry of result.entries) {
      if (entry[".tag"] === "file") yield entry;
    }
  }

  // Expose final cursor via return value — generators can't return but we yield a sentinel
  // The caller should track cursor from result.cursor; we store it separately.
  return result.cursor;
}
