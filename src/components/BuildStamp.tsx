"use client";

import { useEffect, useState } from "react";

type Stamp = {
  env: string;
  ref: string;
  sha: string;
  deploymentUrl: string;
};

const FALLBACK: Stamp = {
  env: "local",
  ref: "local",
  sha: "local",
  deploymentUrl: "local",
};

export function BuildStamp({ className = "" }: { className?: string }) {
  const [stamp, setStamp] = useState<Stamp>(FALLBACK);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/build-stamp", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<Stamp>;
        if (cancelled) return;
        setStamp({
          env: data.env ?? FALLBACK.env,
          ref: data.ref ?? FALLBACK.ref,
          sha: data.sha ?? FALLBACK.sha,
          deploymentUrl: data.deploymentUrl ?? FALLBACK.deploymentUrl,
        });
      } catch {
        // Keep local fallback stamp
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <p className={`text-[11px] text-slate-500 ${className}`}>
      {stamp.env} • {stamp.ref} • {stamp.sha} • {stamp.deploymentUrl}
    </p>
  );
}
