import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  createDefaultProgress,
  normalizeOnboardingScope,
  ONBOARDING_TOTAL_STEPS,
  onboardingPathForScope,
} from "@/lib/onboarding";

type SessionBody = {
  scope?: string;
  currentStep?: number;
  complete?: boolean;
  steps?: Record<string, boolean>;
  valuesSeen?: string[];
  policiesSeen?: string[];
  checklist?: Record<string, boolean>;
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const scope = normalizeOnboardingScope(request.nextUrl.searchParams.get("mode") ?? request.nextUrl.searchParams.get("scope"));

  const [sessionRes, progressRes, settingsRes] = await Promise.all([
    supabase
      .from("onboarding_sessions")
      .select("current_step, completed_at")
      .eq("user_id", user.id)
      .eq("scope", scope)
      .maybeSingle(),
    supabase
      .from("onboarding_progress")
      .select("steps, values_seen, policies_seen, checklist")
      .eq("user_id", user.id)
      .eq("scope", scope)
      .maybeSingle(),
    supabase
      .from("org_settings")
      .select("force_onboarding, enable_celebrations")
      .limit(1)
      .maybeSingle(),
  ]);

  const currentStep = Math.max(1, Math.min(ONBOARDING_TOTAL_STEPS, Number(sessionRes.data?.current_step ?? 1)));
  const completedAt = sessionRes.data?.completed_at ?? null;
  const forceOnboarding = settingsRes.data?.force_onboarding === true;
  const enableCelebrations = settingsRes.data?.enable_celebrations !== false;
  const required = forceOnboarding || !completedAt;

  return NextResponse.json({
    ok: true,
    scope,
    required,
    targetPath: onboardingPathForScope(scope),
    forceOnboarding,
    enableCelebrations,
    session: {
      currentStep,
      completedAt,
    },
    progress: {
      ...createDefaultProgress(),
      ...(progressRes.data ?? {}),
      steps: (progressRes.data?.steps as Record<string, boolean> | undefined) ?? {},
      values_seen: (progressRes.data?.values_seen as string[] | undefined) ?? [],
      policies_seen: (progressRes.data?.policies_seen as string[] | undefined) ?? [],
      checklist: (progressRes.data?.checklist as Record<string, boolean> | undefined) ?? {},
    },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({} as SessionBody));
  const scope = normalizeOnboardingScope(body.scope);
  const currentStep = Math.max(1, Math.min(ONBOARDING_TOTAL_STEPS, Number(body.currentStep ?? 1)));
  const complete = body.complete === true;

  const [existingSessionRes, existingProgressRes] = await Promise.all([
    supabase
      .from("onboarding_sessions")
      .select("completed_at")
      .eq("user_id", user.id)
      .eq("scope", scope)
      .maybeSingle(),
    supabase
      .from("onboarding_progress")
      .select("steps, values_seen, policies_seen, checklist")
      .eq("user_id", user.id)
      .eq("scope", scope)
      .maybeSingle(),
  ]);
  const existingProgress = existingProgressRes.data;

  const mergedSteps = {
    ...((existingProgress?.steps as Record<string, boolean> | undefined) ?? {}),
    ...(body.steps ?? {}),
  };
  const mergedValuesSeen = Array.from(new Set([
    ...(((existingProgress?.values_seen as string[] | undefined) ?? [])),
    ...(body.valuesSeen ?? []),
  ]));
  const mergedPoliciesSeen = Array.from(new Set([
    ...(((existingProgress?.policies_seen as string[] | undefined) ?? [])),
    ...(body.policiesSeen ?? []),
  ]));
  const mergedChecklist = {
    ...((existingProgress?.checklist as Record<string, boolean> | undefined) ?? {}),
    ...(body.checklist ?? {}),
  };

  const nowIso = new Date().toISOString();

  const [sessionUpsert, progressUpsert] = await Promise.all([
    supabase
      .from("onboarding_sessions")
      .upsert(
        {
          user_id: user.id,
          scope,
          current_step: currentStep,
          completed_at: complete ? nowIso : existingSessionRes.data?.completed_at ?? null,
        },
        { onConflict: "user_id,scope" },
      ),
    supabase
      .from("onboarding_progress")
      .upsert(
        {
          user_id: user.id,
          scope,
          steps: mergedSteps,
          values_seen: mergedValuesSeen,
          policies_seen: mergedPoliciesSeen,
          checklist: mergedChecklist,
        },
        { onConflict: "user_id,scope" },
      ),
  ]);

  if (sessionUpsert.error) {
    return NextResponse.json({ error: sessionUpsert.error.message }, { status: 400 });
  }
  if (progressUpsert.error) {
    return NextResponse.json({ error: progressUpsert.error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    scope,
    currentStep,
    completedAt: complete ? nowIso : null,
  });
}
