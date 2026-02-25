import { NextRequest, NextResponse } from "next/server";

// GET /api/dropbox/connect?projectId=xxx
// Redirect to Dropbox OAuth
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const appKey = process.env.DROPBOX_APP_KEY;
  if (!appKey) return NextResponse.json({ error: "DROPBOX_APP_KEY not configured" }, { status: 500 });

  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/dropbox/callback`;
  const state = Buffer.from(JSON.stringify({ projectId })).toString("base64");

  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.searchParams.set("client_id", appKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("token_access_type", "offline"); // refresh token

  return NextResponse.redirect(url.toString());
}
