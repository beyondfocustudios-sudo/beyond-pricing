"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AuthShell({
  children,
  maxWidth = 1120,
  className,
  contentClassName,
}: {
  children: ReactNode;
  maxWidth?: number;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("super-theme super-shell-bg h-full min-h-full w-full", className)}>
      <main
        className="mx-auto h-full min-h-0 w-full overflow-y-auto"
        style={{ padding: "clamp(16px, 2.5vw, 40px)" }}
      >
        <div className={cn("mx-auto w-full", contentClassName)} style={{ maxWidth }}>
          {children}
        </div>
      </main>
    </div>
  );
}

