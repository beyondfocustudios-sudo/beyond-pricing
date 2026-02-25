"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BuildStamp } from "@/lib/build-stamp";

type BuildStampBadgeProps = {
  stamp: BuildStamp;
};

function formatBuildTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-PT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BuildStampBadge({ stamp }: BuildStampBadgeProps) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const enabledByEnv = process.env.NEXT_PUBLIC_BUILD_STAMP === "1";
  const enabledByQuery = searchParams.get("debug") === "1";
  const enabled = enabledByEnv || enabledByQuery;
  const payload = useMemo(
    () =>
      JSON.stringify(
        {
          env: stamp.env,
          branch: stamp.ref,
          sha: stamp.sha,
          buildTime: stamp.builtAt,
          deploymentUrl: stamp.deploymentUrl,
        },
        null,
        2,
      ),
    [stamp],
  );

  if (!enabled) return null;

  return (
    <div className="fixed bottom-2 right-2 z-[9999] space-y-2 text-[10px] font-medium tracking-wide">
      <div
        aria-label="build-stamp"
        className="pointer-events-auto flex items-center gap-2 rounded-full border px-2 py-1"
        style={{
          borderColor: "var(--border-soft, rgba(148, 163, 184, 0.3))",
          background: "color-mix(in srgb, var(--surface, #0b1220) 88%, transparent)",
          color: "var(--text-2, #94a3b8)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span>{stamp.env} · {stamp.ref} · {stamp.sha} · {formatBuildTime(stamp.builtAt)}</span>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-full border px-2 py-0.5"
          style={{ borderColor: "var(--border)" }}
        >
          Ver versão
        </button>
      </div>
      {open ? (
        <div
          className="pointer-events-auto max-w-[min(92vw,420px)] rounded-xl border p-2 text-[10px]"
          style={{
            borderColor: "var(--border-soft, rgba(148, 163, 184, 0.3))",
            background: "color-mix(in srgb, var(--surface, #0b1220) 92%, transparent)",
            color: "var(--text-2, #94a3b8)",
          }}
        >
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words">{payload}</pre>
          <a href="/api/version" target="_blank" rel="noreferrer" className="underline">
            /api/version
          </a>
        </div>
      ) : null}
    </div>
  );
}
