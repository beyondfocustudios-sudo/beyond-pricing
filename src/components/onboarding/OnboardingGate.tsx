"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type OnboardingGateProps = {
  surface: "app" | "portal";
  collaboratorMode?: boolean;
};

export function OnboardingGate({ surface, collaboratorMode = false }: OnboardingGateProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const run = async () => {
      const onboardingPath = surface === "portal" ? "/portal/onboarding" : "/app/onboarding";
      if (pathname.startsWith(onboardingPath)) return;

      const query = new URLSearchParams({
        surface,
        mode: surface === "portal" ? "client" : collaboratorMode ? "collaborator" : "team",
      });

      const res = await fetch(`/api/onboarding/session?${query.toString()}`, { cache: "no-store" });
      if (!active || !res.ok) return;

      const payload = await res.json().catch(() => ({} as { required?: boolean; targetPath?: string }));
      if (!active) return;

      if (payload.required && typeof payload.targetPath === "string" && pathname !== payload.targetPath) {
        router.replace(payload.targetPath);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [collaboratorMode, pathname, router, surface]);

  return null;
}
