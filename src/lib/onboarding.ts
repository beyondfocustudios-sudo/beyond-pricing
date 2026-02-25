export type OnboardingScope = "app_team" | "app_collab" | "portal_client";

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
  if (!value) return "app_team";
  if (value === "app_collab" || value === "collaborator") return "app_collab";
  if (value === "portal_client" || value === "client") return "portal_client";
  return "app_team";
}

export function onboardingPathForScope(scope: OnboardingScope) {
  return scope === "portal_client" ? "/portal/onboarding" : "/app/onboarding";
}

export function onboardingDonePathForScope(scope: OnboardingScope) {
  if (scope === "portal_client") return "/portal";
  if (scope === "app_collab") return "/app/collaborator";
  return "/app/dashboard";
}

export function onboardingModeForSurface(surface: "app" | "portal", collaboratorMode = false): OnboardingScope {
  if (surface === "portal") return "portal_client";
  return collaboratorMode ? "app_collab" : "app_team";
}

export function onboardingLocalDoneKey(scope: OnboardingScope) {
  return `bp:onboarding:done:${scope}`;
}

export function createDefaultProgress(): OnboardingProgressRow {
  return {
    steps: {},
    values_seen: [],
    policies_seen: [],
    checklist: {},
  };
}
