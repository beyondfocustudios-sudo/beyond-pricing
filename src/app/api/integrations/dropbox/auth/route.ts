import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveAccessRole } from "@/lib/access-role";

const STATE_COOKIE = "bp_dropbox_oauth_state";

function getDropboxClientId() {
  return process.env.DROPBOX_CLIENT_ID || process.env.DROPBOX_APP_KEY || "";
}

function getRedirectUri(request: NextRequest) {
  return process.env.DROPBOX_REDIRECT_URI || new URL("/api/integrations/dropbox/callback", request.nextUrl.origin).toString();
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/app/integrations", request.url));
  }

  const access = await resolveAccessRole(supabase, user);
  if (access.isClient) {
    return NextResponse.redirect(new URL("/portal?mismatch=dropbox", request.url));
  }

  const clientId = getDropboxClientId();
  if (!clientId) {
    return NextResponse.redirect(new URL("/app/integrations?error=dropbox_oauth_config", request.url));
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  const nextPath = request.nextUrl.searchParams.get("next")
    || (projectId ? `/app/projects/${projectId}` : "/app/integrations");

  const nonce = randomBytes(18).toString("hex");
  const statePayload = Buffer.from(
    JSON.stringify({
      nonce,
      userId: user.id,
      orgId: access.orgId,
      nextPath,
    }),
  ).toString("base64url");

  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getRedirectUri(request));
  url.searchParams.set("state", statePayload);
  url.searchParams.set("token_access_type", "offline");

  const response = NextResponse.redirect(url.toString());
  response.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}
