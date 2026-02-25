"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type VersionPayload = {
  sha: string | null;
  branch: string | null;
  env: string | null;
  buildTime: string | null;
  deploymentUrl: string | null;
};

export default function DebugBuildStamp({ className = "" }: { className?: string }) {
  const searchParams = useSearchParams();
  const enabled = useMemo(
    () => searchParams.get("debug") === "1" || process.env.NEXT_PUBLIC_BUILD_STAMP === "1",
    [searchParams],
  );

  const [payload, setPayload] = useState<VersionPayload | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      const res = await fetch("/api/version", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (cancelled || !json) return;
      setPayload(json as VersionPayload);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled || !payload) return null;

  const shortSha = payload.sha ? payload.sha.slice(0, 7) : "local";

  return (
    <div
      className={`pointer-events-none fixed bottom-2 left-2 z-[9998] rounded-full border px-2.5 py-1 text-[11px] ${className}`}
      style={{
        borderColor: "var(--border-2)",
        background: "color-mix(in srgb, var(--surface) 78%, transparent)",
        color: "var(--text-3)",
        backdropFilter: "blur(10px)",
      }}
    >
      {payload.env ?? "local"} • {payload.branch ?? "local"} • {shortSha} • {payload.buildTime ?? "n/a"}
    </div>
  );
}

