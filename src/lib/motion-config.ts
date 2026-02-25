"use client";

import { useEffect, useState } from "react";

type MotionConfig = {
  enableCelebrations: boolean;
  enableSmoothScroll: boolean;
};

const DEFAULT_CONFIG: MotionConfig = {
  enableCelebrations: true,
  enableSmoothScroll: false,
};

export function useMotionConfig() {
  const [config, setConfig] = useState<MotionConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/motion/config", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as Partial<MotionConfig>;
        if (!active) return;
        setConfig({
          enableCelebrations: data.enableCelebrations !== false,
          enableSmoothScroll: data.enableSmoothScroll === true,
        });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return { ...config, loading };
}

