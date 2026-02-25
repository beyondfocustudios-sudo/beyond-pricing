import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const PROVIDERS = [
  "notion",
  "whatsapp",
  "youtube",
  "vimeo",
  "dropbox",
  "calendars",
  "slack",
  "outlook",
] as const;

type Provider = (typeof PROVIDERS)[number];

function normalizeProvider(value: unknown): Provider | null {
  const provider = String(value ?? "").trim().toLowerCase();
  return PROVIDERS.includes(provider as Provider) ? (provider as Provider) : null;
}

async function resolveAdminAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };

  const { data: teamRow } = await supabase
    .from("team_members")
    .select("role, org_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = String(teamRow?.role ?? user.app_metadata?.role ?? "").toLowerCase();
  if (role !== "owner" && role !== "admin") {
    return { error: NextResponse.json({ error: "Apenas owner/admin podem gerir integrações." }, { status: 403 }) };
  }

  let orgId = (teamRow?.org_id as string | null) ?? null;
  if (!orgId) {
    const { data: org } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
    orgId = (org?.id as string | null) ?? null;
  }

  return {
    supabase,
    userId: user.id,
    orgId,
  };
}

export async function GET() {
  const access = await resolveAdminAccess();
  if ("error" in access) return access.error;

  const { supabase, orgId } = access;
  const { data, error } = await supabase
    .from("integrations")
    .select("id, provider, status, connected_at, last_error, config")
    .eq("org_id", orgId)
    .order("provider", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const byProvider = new Map((data ?? []).map((row) => [String(row.provider), row]));
  const integrations = PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    return {
      id: row?.id ?? null,
      provider,
      status: row?.status ?? "not_connected",
      connectedAt: row?.connected_at ?? null,
      lastError: row?.last_error ?? null,
      config: row?.config ?? {},
    };
  });

  return NextResponse.json({ integrations });
}

export async function POST(request: NextRequest) {
  const access = await resolveAdminAccess();
  if ("error" in access) return access.error;

  const body = await request.json().catch(() => ({} as { provider?: string; action?: string; config?: Record<string, unknown> }));
  const provider = normalizeProvider(body.provider);
  if (!provider) {
    return NextResponse.json({ error: "Provider inválido." }, { status: 400 });
  }

  const action = String(body.action ?? "connect").toLowerCase();
  if (!["connect", "disconnect", "config"].includes(action)) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const isDisconnect = action === "disconnect";
  const updatePayload = {
    org_id: access.orgId,
    provider,
    status: isDisconnect ? "not_connected" : "connected",
    connected_by: access.userId,
    connected_at: isDisconnect ? null : nowIso,
    config: typeof body.config === "object" && body.config ? body.config : {},
    last_error: null as string | null,
  };

  const { data: row, error } = await access.supabase
    .from("integrations")
    .upsert(updatePayload, { onConflict: "org_id,provider" })
    .select("id, provider, status, connected_at, config")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (row?.id) {
    await access.supabase.from("integration_runs").insert({
      integration_id: row.id,
      status: "success",
      payload: {
        action,
        provider,
        at: nowIso,
      },
      started_at: nowIso,
      finished_at: nowIso,
    });
  }

  return NextResponse.json({
    ok: true,
    integration: row,
  });
}
