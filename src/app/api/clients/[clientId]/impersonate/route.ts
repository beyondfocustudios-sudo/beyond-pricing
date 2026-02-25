import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createStatelessImpersonationToken,
  createPortalImpersonationToken,
  hashPortalImpersonationToken,
  requireOwnerAdminUser,
} from "@/lib/portal-impersonation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireOwnerAdminUser();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { clientId } = await params;
  const admin = createServiceClient();

  const { data: client } = await admin
    .from("clients")
    .select("id, name, deleted_at")
    .eq("id", clientId)
    .maybeSingle();

  if (!client || client.deleted_at) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const token = createPortalImpersonationToken();
  const tokenHash = hashPortalImpersonationToken(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error: insertError } = await admin
    .from("portal_impersonation_tokens")
    .insert({
      admin_user_id: auth.user.id,
      client_id: clientId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

  let finalToken = token;
  if (insertError) {
    // Backward-compatible fallback when migration 046 is not yet applied.
    if (insertError.message.includes("portal_impersonation_tokens")) {
      const stateless = createStatelessImpersonationToken({
        adminUserId: auth.user.id,
        clientId,
        expiresAt,
      });
      if (!stateless) {
        return NextResponse.json({ error: "PORTAL_IMPERSONATION_SECRET em falta no servidor." }, { status: 500 });
      }
      finalToken = stateless;
    } else {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const origin = new URL(request.url).origin;

  return NextResponse.json({
    ok: true,
    client: { id: client.id, name: client.name },
    expiresAt,
    portalUrl: `${origin}/portal?impersonate=${finalToken}`,
  });
}
