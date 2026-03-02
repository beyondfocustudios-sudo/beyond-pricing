"use client";

type StatusVariant =
  | "active"
  | "on-hold"
  | "blocked"
  | "archived"
  | "lead"
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired";

interface StatusBadgeProps {
  status: StatusVariant;
  className?: string;
}

const STATUS_CONFIG: Record<
  StatusVariant,
  { label: string; dot: string; bg: string; text: string }
> = {
  active:   { label: "Ativo",      dot: "#22C55E", bg: "rgba(34,197,94,0.1)",   text: "#16A34A" },
  "on-hold":{ label: "Em espera",  dot: "#F97316", bg: "rgba(249,115,22,0.1)",  text: "#EA580C" },
  blocked:  { label: "Bloqueado",  dot: "#EF4444", bg: "rgba(239,68,68,0.1)",   text: "#DC2626" },
  archived: { label: "Arquivado",  dot: "#94A3B8", bg: "rgba(148,163,184,0.1)", text: "#64748B" },
  lead:     { label: "Lead",       dot: "#8B5CF6", bg: "rgba(139,92,246,0.1)",  text: "#7C3AED" },
  draft:    { label: "Rascunho",   dot: "#94A3B8", bg: "rgba(148,163,184,0.1)", text: "#64748B" },
  sent:     { label: "Enviado",    dot: "#3B82F6", bg: "rgba(59,130,246,0.1)",  text: "#2563EB" },
  viewed:   { label: "Visto",      dot: "#06B6D4", bg: "rgba(6,182,212,0.1)",   text: "#0891B2" },
  accepted: { label: "Aceite",     dot: "#22C55E", bg: "rgba(34,197,94,0.1)",   text: "#16A34A" },
  declined: { label: "Recusado",   dot: "#EF4444", bg: "rgba(239,68,68,0.1)",   text: "#DC2626" },
  expired:  { label: "Expirado",   dot: "#F59E0B", bg: "rgba(245,158,11,0.1)",  text: "#D97706" },
};

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={{ background: cfg.bg, color: cfg.text }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}
