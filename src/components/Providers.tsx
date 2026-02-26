"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/Toast";
import DevConsoleNoiseFilter from "@/components/DevConsoleNoiseFilter";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DevConsoleNoiseFilter />
      {children}
    </ToastProvider>
  );
}
