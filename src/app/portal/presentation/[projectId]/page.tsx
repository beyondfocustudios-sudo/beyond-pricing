"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, MonitorUp } from "lucide-react";

export default function PortalPresentationModePage() {
  const params = useParams<{ projectId: string }>();

  return (
    <div className="card min-h-[72vh] p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href={`/portal/projects/${params.projectId}?tab=approvals`} className="btn btn-ghost btn-sm">
          <ArrowLeft className="h-4 w-4" /> Voltar ao projeto
        </Link>
        <span className="pill text-xs">
          <MonitorUp className="mr-1 h-3.5 w-3.5" /> Modo apresentação
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-3xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <div className="aspect-video rounded-2xl border border-dashed" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 88%, transparent)" }} />
          <p className="mt-3 text-xs" style={{ color: "var(--text-3)" }}>
            Vista focada para reunião de revisão. Usa o modo de review para comentar por timecode.
          </p>
        </section>

        <aside className="rounded-3xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Comentários</h2>
          <div className="mt-3 space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-xs" style={{ color: "var(--text-2)" }}>Thread {index + 1}</p>
                <p className="text-[11px]" style={{ color: "var(--text-3)" }}>Clique em review para foco por timecode.</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn btn-secondary btn-sm flex-1"><ChevronLeft className="h-4 w-4" /> Prev</button>
            <button className="btn btn-secondary btn-sm flex-1">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        </aside>
      </div>
    </div>
  );
}
