import { NextRequest, NextResponse } from "next/server";

// GET /api/dropbox/connect?projectId=xxx
// Redirect to Dropbox OAuth
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const next = req.nextUrl.searchParams.get("next");
  const url = new URL("/api/integrations/dropbox/auth", req.nextUrl.origin);
  if (projectId) {
    url.searchParams.set("projectId", projectId);
  }
  if (next) {
    url.searchParams.set("next", next);
  }
  return NextResponse.redirect(url);
}
