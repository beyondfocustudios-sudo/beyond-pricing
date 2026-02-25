"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { transitions, variants } from "@/lib/motion";

type AuthSplitLayoutProps = {
  eyebrow: string;
  title: string;
  description: string;
  heroTitle: string;
  heroDescription: string;
  children: ReactNode;
  heroBadges?: string[];
  footerNote?: string;
};

export function AuthSplitLayout({
  eyebrow,
  title,
  description,
  heroTitle,
  heroDescription,
  children,
  heroBadges = [],
  footerNote,
}: AuthSplitLayoutProps) {
  return (
    <AuthShell maxWidth={1160}>
      <motion.div
        initial="initial"
        animate="animate"
        variants={variants.page}
        transition={transitions.page}
        className="w-full"
      >
        <section className="card-glass overflow-hidden rounded-[34px] border" style={{ borderColor: "var(--border-soft)" }}>
          <div className="grid min-h-[680px] md:grid-cols-[1.02fr_1fr]">
            <div className="p-6 sm:p-8 md:p-10">
              <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>
                {eyebrow}
              </p>
              <h1 className="mt-2 text-[1.9rem] font-[560] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                {title}
              </h1>
              <p className="mt-2 max-w-md text-sm" style={{ color: "var(--text-2)" }}>
                {description}
              </p>

              <div className="mt-7">{children}</div>

              {footerNote ? (
                <p className="mt-6 text-xs" style={{ color: "var(--text-3)" }}>
                  {footerNote}
                </p>
              ) : null}
            </div>

            <aside className="relative hidden border-l p-10 md:flex md:flex-col md:justify-between" style={{ borderColor: "var(--border)" }}>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(50rem 30rem at 14% 12%, rgba(26,143,163,0.24), transparent 58%), radial-gradient(42rem 26rem at 84% 88%, rgba(216,206,246,0.24), transparent 58%)",
                }}
              />

              <div className="relative z-10">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: "var(--accent-primary)", color: "#fff" }}>
                  <Zap className="h-5 w-5" />
                </div>
                <h2 className="mt-6 text-[2rem] font-[560] tracking-[-0.03em]" style={{ color: "var(--text)" }}>
                  {heroTitle}
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
                  {heroDescription}
                </p>
              </div>

              <div className="relative z-10 space-y-3">
                <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border-soft)", background: "color-mix(in srgb, var(--surface) 78%, transparent)" }}>
                  <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
                    Quick Action
                  </p>
                  <div className="mt-2 flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent-primary)" }} />
                    <span className="text-xs" style={{ color: "var(--text-2)" }}>
                      Type to open dashboard context
                    </span>
                  </div>
                </div>

                {heroBadges.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {heroBadges.map((badge) => (
                      <span key={badge} className="pill inline-flex px-2.5 py-1 text-xs">
                        {badge}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </section>
      </motion.div>
    </AuthShell>
  );
}
