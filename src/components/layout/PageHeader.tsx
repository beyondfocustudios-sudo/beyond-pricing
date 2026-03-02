"use client";

import { motion } from "framer-motion";
import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface ActionButton {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ActionButton[];
  className?: string;
}

const ACTION_STYLES: Record<string, string> = {
  primary:
    "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90",
  secondary:
    "inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors hover:bg-black/5",
  ghost:
    "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-black/5",
};

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={`flex flex-col gap-1 pb-6 ${className}`}
    >
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight size={12} className="opacity-40" />
              )}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="text-xs font-medium transition-colors hover:opacity-80"
                  style={{ color: "var(--text-3, #94A3B8)" }}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--text-3, #94A3B8)" }}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold leading-tight"
            style={{
              fontFamily: "var(--font-dm-serif, Georgia, serif)",
              color: "var(--text, #1B4965)",
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="mt-0.5 text-sm"
              style={{ color: "var(--text-2, #64748B)" }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {actions && actions.length > 0 && (
          <div className="flex flex-shrink-0 items-center gap-2">
            {actions.map((action, i) => {
              const variant = action.variant ?? "primary";
              const Icon = action.icon;
              const cls = ACTION_STYLES[variant];
              const style =
                variant === "primary"
                  ? { background: "var(--bf-accent, #1B4965)" }
                  : { color: "var(--text, #1B4965)", borderColor: "var(--border, rgba(0,0,0,0.1))" };

              return action.href ? (
                <Link key={i} href={action.href} className={cls} style={style}>
                  {Icon && <Icon size={15} />}
                  {action.label}
                </Link>
              ) : (
                <button key={i} onClick={action.onClick} className={cls} style={style}>
                  {Icon && <Icon size={15} />}
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
