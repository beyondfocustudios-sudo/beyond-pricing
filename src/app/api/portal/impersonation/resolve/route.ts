import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerAdminUser,
  resolvePortalImpersonationContext,
} from "@/lib/portal-impersonation";

export async function GET(request: NextRequest) {
  const auth = await requireOwnerAdminUser();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const token = request.nextUrl.searchParams.get("token") ?? "";
  const resolved = await resolvePortalImpersonationContext(token, {
    enforceAdminUserId: auth.user.id,
  });

  if (!resolved.context) {
    return NextResponse.json({ error: resolved.error ?? "Token inválido." }, { status: resolved.status ?? 400 });
  }

  return NextResponse.json({
    ok: true,
    context: resolved.context,
  });
}
