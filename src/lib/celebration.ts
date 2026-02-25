"use client";

type CelebrationType = "project_created" | "deliverable_approved";

const ONCE_KEYS: Record<CelebrationType, string> = {
  project_created: "bp_celebrated_project_created_once",
  deliverable_approved: "bp_celebrated_deliverable_approved_once",
};

function canCelebrate(enabled: boolean) {
  if (!enabled || typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export async function fireCelebration(type: CelebrationType, enabled: boolean) {
  if (!canCelebrate(enabled)) return;

  const key = ONCE_KEYS[type];
  if (type === "project_created" && window.localStorage.getItem(key) === "1") {
    return;
  }

  const confettiModule = await import("canvas-confetti");
  const confetti = confettiModule.default;

  confetti({
    particleCount: type === "project_created" ? 80 : 120,
    spread: type === "project_created" ? 55 : 68,
    startVelocity: type === "project_created" ? 28 : 34,
    scalar: 0.9,
    ticks: 180,
    origin: { y: 0.72 },
  });

  if (type === "project_created") {
    window.localStorage.setItem(key, "1");
  }
}

