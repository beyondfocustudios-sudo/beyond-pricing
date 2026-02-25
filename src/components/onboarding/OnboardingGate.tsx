"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onboardingLocalDoneKey, onboardingModeForSurface, type OnboardingScope } from "@/lib/onboarding";

type OnboardingGateProps = {
  surface: "app" | "portal";
  collaboratorMode?: boolean;
};

type GateBannerState =
  | { kind: "required"; message: string; targetPath: string }
  | { kind: "unavailable"; message: string };

function devLog(message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[onboarding-gate] ${message}`);
  }
}

function recentlyCompletedLocally(scope: OnboardingScope) {
  if (typeof window === "undefined") return false;
  const value = window.localStorage.getItem(onboardingLocalDoneKey(scope));
  if (!value) return false;
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp < 90_000;
}

export function OnboardingGate({ surface, collaboratorMode = false }: OnboardingGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [banner, setBanner] = useState<GateBannerState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const mode = onboardingModeForSurface(surface, collaboratorMode);

  const fetchSession = useCallback(async () => {
    const query = new URLSearchParams({
      surface,
      mode,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await fetch(`/api/onboarding/session?${query.toString()}`, { cache: "no-store" });
      const payload = await res.json().catch(() => ({} as Record<string, unknown>));
      const schemaUnavailable = payload?.warningCode === "schema_unavailable";
      if ((res.ok && !schemaUnavailable) || attempt === 1) {
        return { res, payload };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return {
      res: new Response(null, { status: 500 }),
      payload: {} as Record<string, unknown>,
    };
  }, [mode, surface]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const onboardingPath = surface === "portal" ? "/portal/onboarding" : "/app/onboarding";
      if (pathname.startsWith(onboardingPath)) {
        setBanner(null);
        return;
      }

      const { res, payload } = await fetchSession();
      if (!active) return;

      if (!res.ok) {
        devLog(`session request failed with status ${res.status}`);
        setBanner({
          kind: "unavailable",
          message: "Onboarding indisponível (erro) — continuar para a plataforma.",
        });
        return;
      }

      const scope = String(payload.scope ?? mode) as OnboardingScope;
      const available = payload.available !== false;
      const required = payload.required === true;
      const targetPath = typeof payload.targetPath === "string" ? payload.targetPath : onboardingPath;
      const warningMessage = typeof payload.warningMessage === "string" ? payload.warningMessage : null;

      if (!available) {
        devLog(warningMessage ?? "onboarding unavailable");
        setBanner({
          kind: "unavailable",
          message: "Onboarding indisponível (erro) — continuar para a plataforma.",
        });
        return;
      }

      if (!required || recentlyCompletedLocally(scope)) {
        setBanner(null);
        return;
      }

      setBanner({
        kind: "required",
        message: "Onboarding pendente. Podes continuar a navegar e retomar quando quiseres.",
        targetPath,
      });
    };

    void run();
    return () => {
      active = false;
    };
  }, [fetchSession, mode, pathname, refreshToken, surface]);

  useEffect(() => {
    setHidden(false);
  }, [pathname]);

  if (!banner || hidden) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 w-[min(30rem,calc(100vw-2rem))] md:bottom-6">
      <div
        className="rounded-2xl border p-3 shadow-lg backdrop-blur-md"
        style={{
          background: "color-mix(in srgb, var(--surface) 88%, transparent)",
          borderColor: "var(--border)",
          color: "var(--text)",
        }}
      >
        <p className="text-sm">{banner.message}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {banner.kind === "required" ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                router.push(banner.targetPath);
              }}
            >
              Retomar onboarding
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setHidden(false);
                setRefreshToken((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => setHidden(true)}>
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
