import { NextRequest, NextResponse } from "next/server";

// Legacy callback route kept for backward compatibility.
// New flow uses /api/integrations/dropbox/callback.
export async function GET(req: NextRequest) {
  const forward = new URL("/api/integrations/dropbox/callback", req.nextUrl.origin);
  req.nextUrl.searchParams.forEach((value, key) => {
    forward.searchParams.set(key, value);
  });
  return NextResponse.redirect(forward);
}
