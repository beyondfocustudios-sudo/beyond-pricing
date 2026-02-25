export type OnboardingScope = "team" | "collaborator" | "client";

export type OnboardingSessionRow = {
  current_step: number;
  completed_at: string | null;
};

export type OnboardingProgressRow = {
  steps: Record<string, boolean>;
  values_seen: string[];
  policies_seen: string[];
  checklist: Record<string, boolean>;
};

export const ONBOARDING_TOTAL_STEPS = 6;

export function normalizeOnboardingScope(value: string | null | undefined): OnboardingScope {
  if (value === "collaborator") return "collaborator";
  if (value === "client") return "client";
  return "team";
}

export function onboardingPathForScope(scope: OnboardingScope) {
  return scope === "client" ? "/portal/onboarding" : "/app/onboarding";
}

export function onboardingDonePathForScope(scope: OnboardingScope) {
  if (scope === "client") return "/portal";
  if (scope === "collaborator") return "/app/collaborator";
  return "/app/dashboard";
}

export function createDefaultProgress(): OnboardingProgressRow {
  return {
    steps: {},
    values_seen: [],
    policies_seen: [],
    checklist: {},
  };
}
