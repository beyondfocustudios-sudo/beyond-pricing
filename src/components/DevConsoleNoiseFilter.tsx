"use client";

import { useEffect } from "react";

const NOISE_PATTERNS = [
  /chrome-extension:\/\//i,
  /FrameDoesNotExistError/i,
  /manifest/i,
  /permissions?\b/i,
  /background\.js/i,
  /localhost:8081/i,
];

function matchesNoise(args: unknown[]) {
  const text = args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");

  return NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Dev-only console filter to reduce extension/debugger noise during QA.
 * Production behavior is untouched.
 */
export default function DevConsoleNoiseFilter() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args: unknown[]) => {
      if (matchesNoise(args)) return;
      originalError(...args);
    };

    console.warn = (...args: unknown[]) => {
      if (matchesNoise(args)) return;
      originalWarn(...args);
    };

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return null;
}

