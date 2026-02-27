import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptDropboxToken } from "@/lib/dropbox-crypto";
import { ensureDropboxRootFolder } from "@/lib/dropbox-folder-sync";

const STATE_COOKIE = "bp_dropbox_oauth_state";

function redirectWithError(request: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/app/integrations?error=${encodeURIComponent(code)}`, request.url));
}

function getDropboxClientId() {
  return process.env.DROPBOX_CLIENT_ID || process.env.DROPBOX_APP_KEY || "";
}

function getDropboxClientSecret() {
  return process.env.DROPBOX_CLIENT_SECRET || process.env.DROPBOX_APP_SECRET || "";
}

function getRedirectUri(request: NextRequest) {
  if (process.env.DROPBOX_REDIRECT_URI) return process.env.DROPBOX_REDIRECT_URI;
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return new URL("/api/dropbox/callback", process.env.NEXT_PUBLIC_SITE_URL).toString();
  }
  return new URL("/api/dropbox/callback", request.nextUrl.origin).toString();
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return redirectWithError(request, "dropbox_oauth_missing_code");
  }

  let decodedState: { nonce?: string; userId?: string; orgId?: string | null; nextPath?: string } = {};
  try {
    decodedState = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    return redirectWithError(request, "dropbox_oauth_state_invalid");
  }

  const cookieNonce = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookieNonce || decodedState.nonce !== cookieNonce) {
    return redirectWithError(request, "dropbox_oauth_state_mismatch");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || decodedState.userId !== user.id) {
    return redirectWithError(request, "dropbox_oauth_user_mismatch");
  }

  const clientId = getDropboxClientId();
  const clientSecret = getDropboxClientSecret();
  if (!clientId || !clientSecret) {
    return redirectWithError(request, "dropbox_oauth_config");
  }

  const tokenRes = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: getRedirectUri(request),
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  const tokenPayload = await tokenRes.json().catch(() => ({} as { error_description?: string }));
  if (!tokenRes.ok) {
    return redirectWithError(request, (tokenPayload as { error_description?: string }).error_description ?? "dropbox_oauth_token_exchange_failed");
  }

  const accessToken = String((tokenPayload as { access_token?: string }).access_token ?? "");
  const refreshToken = String((tokenPayload as { refresh_token?: string }).refresh_token ?? "");
  const accountId = String((tokenPayload as { account_id?: string }).account_id ?? "");
  const expiresIn = Number((tokenPayload as { expires_in?: number }).expires_in ?? 14400);

  if (!accessToken) {
    return redirectWithError(request, "dropbox_oauth_no_access_token");
  }

  let accountEmail: string | null = null;
  try {
    const accountRes = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "null",
    });

    if (accountRes.ok) {
      const accountPayload = await accountRes.json() as { email?: string };
      accountEmail = accountPayload.email ?? null;
    }
  } catch {
    // Non-blocking.
  }

  const admin = createServiceClient();

  let orgId = decodedState.orgId ?? null;
  if (!orgId) {
    const { data: team } = await admin
      .from("team_members")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    orgId = (team?.org_id as string | null) ?? null;
  }

  const encryptedAccess = encryptDropboxToken(accessToken);
  const encryptedRefresh = refreshToken ? encryptDropboxToken(refreshToken) : null;
  const expiresAt = new Date(Date.now() + expiresIn * 1000 - 60_000).toISOString();

  let existingQuery = admin
    .from("dropbox_connections")
    .select("id")
    .is("project_id", null)
    .is("revoked_at", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  existingQuery = orgId ? existingQuery.eq("org_id", orgId) : existingQuery.is("org_id", null);

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();

  if (existingError) {
    return redirectWithError(request, "dropbox_connection_lookup_failed");
  }

  const payload = {
    org_id: orgId,
    project_id: null,
    access_token: accessToken,
    refresh_token: refreshToken || null,
    token_expires_at: expiresAt,
    access_token_enc: encryptedAccess,
    refresh_token_enc: encryptedRefresh,
    access_token_encrypted: encryptedAccess,
    refresh_token_encrypted: encryptedRefresh,
    dropbox_account_id: accountId || null,
    account_id: accountId || null,
    account_email: accountEmail,
    expires_at: expiresAt,
    revoked_at: null,
    metadata: {
      connected_by: user.id,
      source: "oauth",
      connected_at: new Date().toISOString(),
    },
  };

  const query = existing
    ? admin.from("dropbox_connections").update(payload).eq("id", existing.id)
    : admin.from("dropbox_connections").insert(payload);

  const { error: writeError } = await query;
  if (writeError) {
    return redirectWithError(request, "dropbox_connection_save_failed");
  }

  // Best effort: create org root folder on first successful connection.
  await ensureDropboxRootFolder(user.id).catch(() => {
    // Non-blocking; UI can retry via /api/dropbox/ensure-root.
  });

  const nextPath = decodedState.nextPath && decodedState.nextPath.startsWith("/")
    ? decodedState.nextPath
    : "/app/integrations";
  const nextUrl = new URL(nextPath, request.url);
  nextUrl.searchParams.set("connected", "dropbox");

  const response = NextResponse.redirect(nextUrl);
  response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
