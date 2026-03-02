"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";

type TrendDirection = "up" | "down" | "neutral";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: TrendDirection;
  trendValue?: string;
  icon?: LucideIcon;
  prefix?: string;
  suffix?: string;
  className?: string;
}

const TREND_CONFIG: Record<TrendDirection, { icon: LucideIcon; color: string }> = {
  up:      { icon: TrendingUp,   color: "#22C55E" },
  down:    { icon: TrendingDown, color: "#EF4444" },
  neutral: { icon: Minus,        color: "#94A3B8" },
};

export function StatCard({
  label,
  value,
  trend,
  trendValue,
  icon: Icon,
  prefix,
  suffix,
  className = "",
}: StatCardProps) {
  const trendCfg = trend ? TREND_CONFIG[trend] : null;
  const TrendIcon = trendCfg?.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--text-3, #94A3B8)" }}
          >
            {label}
          </p>

          <p
            className="mt-1.5 font-mono text-2xl font-bold leading-none"
            style={{ color: "var(--text, #1B4965)" }}
          >
            {prefix && <span className="text-base font-semibold opacity-70">{prefix}</span>}
            {typeof value === "number"
              ? value.toLocaleString("pt-PT")
              : value}
            {suffix && <span className="ml-0.5 text-base font-semibold opacity-70">{suffix}</span>}
          </p>

          {trendCfg && trendValue && (
            <div className="mt-2 flex items-center gap-1">
              {TrendIcon && (
                <TrendIcon size={12} style={{ color: trendCfg.color }} />
              )}
              <span className="text-xs font-medium" style={{ color: trendCfg.color }}>
                {trendValue}
              </span>
              <span className="text-xs" style={{ color: "var(--text-3, #94A3B8)" }}>
                vs mês anterior
              </span>
            </div>
          )}
        </div>

        {Icon && (
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(27,73,101,0.08)" }}
          >
            <Icon size={18} style={{ color: "var(--bf-accent, #1B4965)" }} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
