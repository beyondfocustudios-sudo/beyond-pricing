import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  getAssistantSettings,
  getAssistantUsage,
  isTeamRole,
  resolveAudienceRole,
} from "@/lib/hq-assistant";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const [settings, role] = await Promise.all([
    getAssistantSettings(supabase),
    resolveAudienceRole(supabase, user),
  ]);

  const usage = await getAssistantUsage(supabase, user.id);
  const aiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const aiAllowedForRole = isTeamRole(role);

  return NextResponse.json({
    enabled: settings.enableHqAssistant,
    motion: {
      enableCelebrations: settings.enableCelebrations,
      enableSmoothScroll: settings.enableSmoothScroll,
    },
    role,
    ai: {
      enabled: settings.enableAiAssistant && aiAllowedForRole && aiConfigured,
      configured: aiConfigured,
      allowedForRole: aiAllowedForRole,
      weeklyLimit: settings.aiWeeklyLimit,
      usageCount: usage.usageCount,
      weekStart: usage.weekStart,
    },
  });
}
