import { getBuildStamp } from "@/lib/build-stamp";

export default function BuildStampBadge() {
  const stamp = getBuildStamp();

  return (
    <div
      aria-label="build-stamp"
      className="pointer-events-none fixed bottom-2 right-2 z-[9999] rounded-full border px-2 py-1 text-[10px] font-medium tracking-wide"
      style={{
        borderColor: "var(--border-soft, rgba(148, 163, 184, 0.3))",
        background: "color-mix(in srgb, var(--surface, #0b1220) 88%, transparent)",
        color: "var(--text-2, #94a3b8)",
        backdropFilter: "blur(8px)",
      }}
    >
      {stamp.env} · {stamp.ref} · {stamp.sha}
    </div>
  );
}

