import { createHash, createHmac, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type ImpersonationContext = {
  tokenRowId: string;
  adminUserId: string;
  clientId: string;
  clientName: string;
  expiresAt: string;
};

type TeamRole = "owner" | "admin" | "member" | "collaborator";

type TokenRow = {
  id: string;
  admin_user_id: string;
  client_id: string;
  expires_at: string;
  revoked_at: string | null;
};

const STATELESS_PREFIX = "stl.";

export function createPortalImpersonationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPortalImpersonationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function statelessSecret() {
  return process.env.PORTAL_IMPERSONATION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function createStatelessImpersonationToken(payload: {
  adminUserId: string;
  clientId: string;
  expiresAt: string;
}) {
  const secret = statelessSecret();
  if (!secret) return null;
  const rawPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(rawPayload).digest("base64url");
  return `${STATELESS_PREFIX}${rawPayload}.${signature}`;
}

function parseStatelessImpersonationToken(token: string) {
  if (!token.startsWith(STATELESS_PREFIX)) return null;
  const secret = statelessSecret();
  if (!secret) return null;
  const raw = token.slice(STATELESS_PREFIX.length);
  const [payloadB64, signature] = raw.split(".");
  if (!payloadB64 || !signature) return null;

  const expected = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (expected !== signature) return null;

  const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
    adminUserId?: string;
    clientId?: string;
    expiresAt?: string;
  };
  if (!parsed.adminUserId || !parsed.clientId || !parsed.expiresAt) return null;
  if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
  return parsed as { adminUserId: string; clientId: string; expiresAt: string };
}

export async function requireOwnerAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Não autenticado.", status: 401 as const };
  }

  const { data: teamRow } = await supabase
    .from("team_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = String(teamRow?.role ?? user.app_metadata?.role ?? "").toLowerCase() as TeamRole | "";
  if (role !== "owner" && role !== "admin") {
    return { error: "Apenas owner/admin podem usar esta ação.", status: 403 as const };
  }

  return { user, role, supabase };
}

export async function resolvePortalImpersonationContext(
  token: string,
  options: { enforceAdminUserId?: string } = {},
): Promise<{ context: ImpersonationContext | null; error?: string; status?: number }> {
  const safeToken = String(token ?? "").trim();
  if (!safeToken) {
    return { context: null, error: "Token em falta.", status: 400 };
  }

  const stateless = parseStatelessImpersonationToken(safeToken);
  if (stateless) {
    if (options.enforceAdminUserId && stateless.adminUserId !== options.enforceAdminUserId) {
      return { context: null, error: "Token não pertence a esta sessão admin.", status: 403 };
    }

    const admin = createServiceClient();
    const { data: clientRow, error: clientError } = await admin
      .from("clients")
      .select("id, name, deleted_at")
      .eq("id", stateless.clientId)
      .maybeSingle();

    if (clientError || !clientRow || clientRow.deleted_at) {
      return { context: null, error: "Cliente indisponível.", status: 404 };
    }

    return {
      context: {
        tokenRowId: "stateless",
        adminUserId: stateless.adminUserId,
        clientId: stateless.clientId,
        clientName: String(clientRow.name ?? "Cliente"),
        expiresAt: stateless.expiresAt,
      },
    };
  }

  const admin = createServiceClient();
  const tokenHash = hashPortalImpersonationToken(safeToken);

  const { data: tokenRow, error: tokenError } = await admin
    .from("portal_impersonation_tokens")
    .select("id, admin_user_id, client_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return { context: null, error: "Token inválido.", status: 404 };
  }

  const typedToken = tokenRow as TokenRow;
  if (typedToken.revoked_at) {
    return { context: null, error: "Token revogado.", status: 410 };
  }

  if (new Date(typedToken.expires_at).getTime() <= Date.now()) {
    return { context: null, error: "Token expirado.", status: 410 };
  }

  if (options.enforceAdminUserId && typedToken.admin_user_id !== options.enforceAdminUserId) {
    return { context: null, error: "Token não pertence a esta sessão admin.", status: 403 };
  }

  const { data: clientRow, error: clientError } = await admin
    .from("clients")
    .select("id, name, deleted_at")
    .eq("id", typedToken.client_id)
    .maybeSingle();

  if (clientError || !clientRow || clientRow.deleted_at) {
    return { context: null, error: "Cliente indisponível.", status: 404 };
  }

  await admin
    .from("portal_impersonation_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", typedToken.id);

  return {
    context: {
      tokenRowId: typedToken.id,
      adminUserId: typedToken.admin_user_id,
      clientId: typedToken.client_id,
      clientName: String(clientRow.name ?? "Cliente"),
      expiresAt: typedToken.expires_at,
    },
  };
}

export async function fetchClientProjectsForPortal(
  admin: SupabaseClient,
  clientId: string,
) {
  const { data } = await admin
    .from("projects")
    .select("id, project_name, client_name, status, updated_at, created_at, shoot_days")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  return (data ?? []) as Array<{
    id: string;
    project_name: string;
    client_name: string | null;
    status: string | null;
    updated_at: string;
    created_at: string;
    shoot_days: string[] | null;
  }>;
}
