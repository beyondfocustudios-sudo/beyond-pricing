"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AuthShell({
  children,
  maxWidth = 1440,
  className,
  contentClassName,
}: {
  children: ReactNode;
  maxWidth?: number;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("super-theme super-shell-bg h-full min-h-dvh w-full", className)}>
      <main
        className="h-full min-h-dvh w-full overflow-y-auto"
      >
        <div
          className={cn("w-full", contentClassName)}
          style={{
            maxWidth,
            margin: "0 auto",
            padding: "clamp(16px, 2.5vw, 32px)",
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
