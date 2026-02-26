import { NextRequest, NextResponse } from "next/server";

// GET /api/dropbox/connect?projectId=xxx
// Redirect to Dropbox OAuth
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const url = new URL("/api/integrations/dropbox/auth", req.nextUrl.origin);
  if (projectId) {
    url.searchParams.set("projectId", projectId);
  }
  return NextResponse.redirect(url);
}
