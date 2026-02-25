"use client";

import { useEffect } from "react";

export function useOptionalSmoothScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let rafId = 0;
    let active = true;
    let lenisInstance: {
      raf: (time: number) => void;
      destroy: () => void;
    } | null = null;

    const setup = async () => {
      const mod = await import("lenis");
      if (!active) return;

      const LenisCtor = mod.default;
      lenisInstance = new LenisCtor({
        duration: 0.8,
        wheelMultiplier: 0.9,
        touchMultiplier: 1,
      });

      const loop = (time: number) => {
        lenisInstance?.raf(time);
        rafId = window.requestAnimationFrame(loop);
      };
      rafId = window.requestAnimationFrame(loop);
    };

    void setup();

    return () => {
      active = false;
      window.cancelAnimationFrame(rafId);
      lenisInstance?.destroy();
    };
  }, [enabled]);
}

