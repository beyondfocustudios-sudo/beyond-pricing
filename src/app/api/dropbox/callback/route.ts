import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateB64 = req.nextUrl.searchParams.get("state") ?? "";
  const origin = req.nextUrl.origin;

  let projectId = "";
  try {
    const parsed = JSON.parse(Buffer.from(stateB64, "base64").toString()) as { projectId: string };
    projectId = parsed.projectId;
  } catch {
    return NextResponse.redirect(`${origin}/app?error=dropbox_state`);
  }

  if (!code) return NextResponse.redirect(`${origin}/app/projects/${projectId}?error=dropbox_denied`);

  const appKey = process.env.DROPBOX_APP_KEY!;
  const appSecret = process.env.DROPBOX_APP_SECRET!;
  const redirectUri = `${origin}/api/dropbox/callback`;

  // Exchange code for tokens
  const tokenResp = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      client_id: appKey,
      client_secret: appSecret,
    }),
  });

  if (!tokenResp.ok) {
    console.error("[dropbox/callback] token exchange failed:", await tokenResp.text());
    return NextResponse.redirect(`${origin}/app/projects/${projectId}?error=dropbox_token`);
  }

  const tokens = await tokenResp.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    account_id: string;
  };

  const supabase = createServiceClient();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Upsert dropbox_connections
  await supabase.from("dropbox_connections").upsert(
    {
      project_id: projectId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      dropbox_account_id: tokens.account_id,
    },
    { onConflict: "project_id" }
  );

  return NextResponse.redirect(`${origin}/app/projects/${projectId}?dropbox=connected`);
}
