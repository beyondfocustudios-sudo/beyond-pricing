import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveAccessRole } from "@/lib/access-role";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type DropboxHealthRow = {
  id: string;
  account_email: string | null;
  account_id: string | null;
  dropbox_account_id: string | null;
  updated_at: string | null;
  token_expires_at: string | null;
  last_synced_at: string | null;
};

function configStatus() {
  const clientId = Boolean(process.env.DROPBOX_CLIENT_ID || process.env.DROPBOX_APP_KEY);
  const clientSecret = Boolean(process.env.DROPBOX_CLIENT_SECRET || process.env.DROPBOX_APP_SECRET);
  const redirectUri = Boolean(process.env.DROPBOX_REDIRECT_URI);
  const tokenSecret = Boolean(process.env.DROPBOX_TOKEN_SECRET || process.env.CALENDAR_TOKEN_SECRET);

  return {
    ready: clientId && clientSecret && tokenSecret,
    missing: [
      ...(clientId ? [] : ["DROPBOX_CLIENT_ID"]),
      ...(clientSecret ? [] : ["DROPBOX_CLIENT_SECRET"]),
      ...(tokenSecret ? [] : ["DROPBOX_TOKEN_SECRET"]),
      ...(redirectUri ? [] : ["DROPBOX_REDIRECT_URI(optional)"]),
    ],
  };
}

async function requireTeamContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }

  const access = await resolveAccessRole(supabase, user);
  if (access.isClient) {
    return { error: NextResponse.json({ error: "Clientes não podem gerir integrações Dropbox" }, { status: 403 }) };
  }

  return {
    user,
    orgId: access.orgId,
    service: createServiceClient(),
  };
}

export async function GET() {
  const context = await requireTeamContext();
  if ("error" in context) return context.error;

  const { orgId, service } = context;
  const cfg = configStatus();

  let connection: DropboxHealthRow | null = null;

  if (orgId) {
    const { data } = await service
      .from("dropbox_connections")
      .select("id, account_email, account_id, dropbox_account_id, updated_at, token_expires_at, last_synced_at")
      .eq("org_id", orgId)
      .is("project_id", null)
      .is("revoked_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    connection = (data as DropboxHealthRow | null) ?? null;
  }

  return NextResponse.json({
    ok: true,
    config: cfg,
    connected: Boolean(connection?.id),
    connection: connection
      ? {
          id: connection.id,
          accountEmail: connection.account_email,
          accountId: connection.dropbox_account_id ?? connection.account_id,
          updatedAt: connection.updated_at,
          expiresAt: connection.token_expires_at,
          lastSyncedAt: connection.last_synced_at,
        }
      : null,
    connectUrl: "/api/integrations/dropbox/auth",
  });
}

export async function POST(request: NextRequest) {
  const context = await requireTeamContext();
  if ("error" in context) return context.error;

  const { orgId, service } = context;
  const body = await request.json().catch(() => ({} as { action?: string }));
  const action = String(body.action ?? "").toLowerCase();

  if (action !== "disconnect") {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  if (!orgId) {
    return NextResponse.json({ error: "Org não definida para este utilizador" }, { status: 400 });
  }

  const { error } = await service
    .from("dropbox_connections")
    .update({
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .is("project_id", null)
    .is("revoked_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
