import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";

type AdminContext = {
  userId: string;
  role: string;
};

type ProjectMetricRow = {
  id: string;
  status: string | null;
  created_at: string;
  calc: { preco_recomendado?: number } | null;
  deleted_at?: string | null;
  archived_at?: string | null;
};

const ADMIN_ROLES = new Set(["owner", "admin"]);
const EXCLUDED_STATUSES = new Set(["archived", "deleted", "arquivado", "apagado"]);

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message ?? "");
}

function isMissingColumnError(error: { code?: string; message?: string } | null, column: string) {
  if (!error) return false;
  return error.code === "42703" || new RegExp(column, "i").test(error.message ?? "");
}

function isExcludedProject(project: ProjectMetricRow) {
  const status = (project.status ?? "").trim().toLowerCase();
  return Boolean(project.deleted_at) || Boolean(project.archived_at) || EXCLUDED_STATUSES.has(status);
}

export async function requireInsightsAdmin(): Promise<AdminContext> {
  const sessionClient = await createClient();
  const { data: authData, error: authError } = await sessionClient.auth.getUser();
  if (authError || !authData.user) {
    throw new Error("NOT_AUTHENTICATED");
  }

  const metaRole = String(authData.user.app_metadata?.role ?? "").toLowerCase();
  if (ADMIN_ROLES.has(metaRole)) {
    return { userId: authData.user.id, role: metaRole };
  }

  const { data: member, error: roleError } = await sessionClient
    .from("team_members")
    .select("role")
    .eq("user_id", authData.user.id)
    .single();

  if (roleError) {
    throw new Error("FORBIDDEN");
  }

  const role = String(member?.role ?? "").toLowerCase();
  if (!ADMIN_ROLES.has(role)) {
    throw new Error("FORBIDDEN");
  }

  return { userId: authData.user.id, role };
}

export async function recalculateInsightsSnapshot() {
  const admin = createServiceClient();
  const attempts = [
    admin
      .from("projects")
      .select("id, status, created_at, calc, deleted_at, archived_at")
      .is("deleted_at", null)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("projects")
      .select("id, status, created_at, calc, deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("projects")
      .select("id, status, created_at, calc")
      .order("created_at", { ascending: false })
      .limit(300),
  ];

  let rows: ProjectMetricRow[] = [];
  let lastError: string | null = null;

  for (const query of attempts) {
    const res = await query;
    if (!res.error) {
      rows = (res.data ?? []) as ProjectMetricRow[];
      break;
    }
    lastError = res.error.message;
  }

  if (rows.length === 0 && lastError) {
    throw new Error(lastError);
  }

  const activeRows = rows.filter((row) => !isExcludedProject(row));
  const withPrice = activeRows.filter((row) => Number(row.calc?.preco_recomendado ?? 0) > 0);
  const totalRevenue = withPrice.reduce((sum, row) => sum + Number(row.calc?.preco_recomendado ?? 0), 0);
  const sent = activeRows.filter((row) => ["enviado", "sent"].includes((row.status ?? "").toLowerCase())).length;
  const approved = activeRows.filter((row) => ["aprovado", "approved"].includes((row.status ?? "").toLowerCase())).length;

  return {
    activeProjects: activeRows.length,
    revenueTotal: totalRevenue,
    averagePrice: withPrice.length > 0 ? totalRevenue / withPrice.length : 0,
    sentCount: sent,
    approvedCount: approved,
    computedAt: new Date().toISOString(),
  };
}

export async function cleanupInsightCaches() {
  const admin = createServiceClient();
  const candidateTables = [
    "insights_cache",
    "insight_cache",
    "insight_snapshots",
    "analytics_cache",
    "kpi_cache",
    "metrics_cache",
    "weather_cache",
  ];

  const cleared: Array<{ table: string; rows: number }> = [];

  for (const table of candidateTables) {
    const res = await admin.from(table).delete({ count: "exact" }).not("id", "is", null);
    if (!res.error) {
      cleared.push({ table, rows: res.count ?? 0 });
      continue;
    }

    if (isMissingRelationError(res.error) || isMissingColumnError(res.error, "id")) {
      continue;
    }

    throw new Error(`[${table}] ${res.error.message}`);
  }

  return {
    cleared,
    totalRows: cleared.reduce((sum, item) => sum + item.rows, 0),
  };
}
