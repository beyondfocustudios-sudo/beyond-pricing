"use client";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  color?: string;
  className?: string;
}

const SIZE_CLASSES: Record<AvatarSize, { wrapper: string; text: string }> = {
  xs: { wrapper: "h-5 w-5",   text: "text-[9px]" },
  sm: { wrapper: "h-7 w-7",   text: "text-[10px]" },
  md: { wrapper: "h-9 w-9",   text: "text-xs" },
  lg: { wrapper: "h-11 w-11", text: "text-sm" },
  xl: { wrapper: "h-14 w-14", text: "text-base" },
};

// Deterministic color from name — same name always gets same color
const PALETTE = [
  { bg: "#DBEAFE", text: "#1E40AF" },
  { bg: "#EDE9FE", text: "#5B21B6" },
  { bg: "#D1FAE5", text: "#065F46" },
  { bg: "#FCE7F3", text: "#9D174D" },
  { bg: "#FEF3C7", text: "#92400E" },
  { bg: "#FFE4CC", text: "#C05621" },
  { bg: "#CFFAFE", text: "#155E75" },
  { bg: "#F0FDF4", text: "#166534" },
];

function getColorFromName(name: string): { bg: string; text: string } {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return PALETTE[hash % PALETTE.length]!;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ name, size = "md", color, className = "" }: AvatarProps) {
  const { wrapper, text } = SIZE_CLASSES[size];
  const { bg, text: textColor } = color
    ? { bg: color, text: "#fff" }
    : getColorFromName(name);

  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold select-none ${wrapper} ${text} ${className}`}
      style={{ background: bg, color: textColor }}
      title={name}
      aria-label={name}
    >
      {getInitials(name)}
    </span>
  );
}
