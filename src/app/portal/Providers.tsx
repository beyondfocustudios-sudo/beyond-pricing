"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import { InboxDrawerProvider } from "@/app/portal/context/InboxDrawerProvider";
import DevConsoleNoiseFilter from "@/components/DevConsoleNoiseFilter";

export function PortalProviders({
  children,
  userId,
}: {
  children: ReactNode;
  userId?: string;
}) {
  return (
    <ToastProvider>
      <ThemeProvider userId={userId}>
        <InboxDrawerProvider>
          <DevConsoleNoiseFilter />
          {children}
        </InboxDrawerProvider>
      </ThemeProvider>
    </ToastProvider>
  );
}
