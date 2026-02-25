import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AssistantIntent =
  | "create_task"
  | "find_project"
  | "open_item"
  | "report_bug"
  | "summarize_context"
  | "help_navigation"
  | "unsupported";

export type AssistantSettings = {
  enableHqAssistant: boolean;
  enableAiAssistant: boolean;
  aiWeeklyLimit: number;
};

export type AudienceRole = "owner" | "admin" | "member" | "client" | "collaborator" | "unknown";

export function weekStartISO(date = new Date()) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc.toISOString().slice(0, 10);
}

export async function getAssistantSettings(supabase: SupabaseClient): Promise<AssistantSettings> {
  const { data } = await supabase
    .from("org_settings")
    .select("enable_hq_assistant, enable_ai_assistant, ai_weekly_limit")
    .limit(1)
    .maybeSingle();

  return {
    enableHqAssistant: data?.enable_hq_assistant !== false,
    enableAiAssistant: data?.enable_ai_assistant === true,
    aiWeeklyLimit: Number(data?.ai_weekly_limit ?? 50) > 0 ? Number(data?.ai_weekly_limit ?? 50) : 50,
  };
}

export async function resolveAudienceRole(supabase: SupabaseClient, user: User): Promise<AudienceRole> {
  const appRole = String(user.app_metadata?.role ?? "").toLowerCase();

  const { data: tm } = await supabase
    .from("team_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const teamRole = String(tm?.role ?? appRole).toLowerCase();
  if (teamRole === "owner" || teamRole === "admin" || teamRole === "member") {
    return teamRole as AudienceRole;
  }

  const { count: clientCount } = await supabase
    .from("client_users")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((clientCount ?? 0) > 0) return "client";

  const { count: collabCount } = await supabase
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("role", ["editor", "collaborator", "freelancer"]);

  if ((collabCount ?? 0) > 0) return "collaborator";
  return "unknown";
}

export function isTeamRole(role: AudienceRole) {
  return role === "owner" || role === "admin" || role === "member";
}

export async function getAssistantUsage(supabase: SupabaseClient, userId: string, weekStart = weekStartISO()) {
  const { data } = await supabase
    .from("assistant_usage")
    .select("usage_count, tokens_estimated, week_start")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  return {
    usageCount: Number(data?.usage_count ?? 0),
    tokensEstimated: Number(data?.tokens_estimated ?? 0),
    weekStart,
  };
}

export async function incrementAssistantUsage(
  supabase: SupabaseClient,
  userId: string,
  incrementBy = 1,
  tokensEstimated = 0,
  weekStart = weekStartISO(),
) {
  const current = await getAssistantUsage(supabase, userId, weekStart);
  const nextCount = current.usageCount + Math.max(1, incrementBy);
  const nextTokens = current.tokensEstimated + Math.max(0, Math.floor(tokensEstimated));

  await supabase
    .from("assistant_usage")
    .upsert(
      {
        user_id: userId,
        week_start: weekStart,
        usage_count: nextCount,
        tokens_estimated: nextTokens,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,week_start" },
    );

  return { usageCount: nextCount, tokensEstimated: nextTokens, weekStart };
}

export function estimateTokenUsage(input: string, output = "") {
  const roughChars = (input?.length ?? 0) + (output?.length ?? 0);
  return Math.max(1, Math.ceil(roughChars / 4));
}

export function inferDeterministicIntent(message: string): AssistantIntent {
  const text = message.trim().toLowerCase();
  if (!text) return "help_navigation";

  if (/\b(cria|criar|adiciona|adicionar)\b.*\b(tarefa|task)\b/.test(text)) return "create_task";
  if (/\b(projeto|project)\b.*\b(encontra|procur|search|abrir|open)\b/.test(text) || /\bprocurar projeto\b/.test(text)) return "find_project";
  if (/\b(abrir|open|ir para|go to|navega)\b/.test(text)) return "open_item";
  if (/\b(bug|erro|falha|problem|problema)\b/.test(text)) return "report_bug";
  if (/\b(resumo|sumariza|summarize|resumir)\b/.test(text)) return "summarize_context";
  if (/\b(onde|como|navegar|help|ajuda)\b/.test(text)) return "help_navigation";

  return "unsupported";
}
