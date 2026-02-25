"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, PlayCircle } from "lucide-react";

type Deliverable = {
  id: string;
  title: string;
  status?: string | null;
};

type Version = {
  id: string;
  file_url?: string | null;
  file_type?: string | null;
  version_number?: number | null;
  version?: number | null;
};

type ReviewComment = {
  id: string;
  body: string;
  created_at: string;
  guest_name?: string | null;
  guest_email?: string | null;
};

type ReviewThread = {
  id: string;
  timecode_seconds?: number | null;
  status: "open" | "resolved";
  review_comments: ReviewComment[];
};

function formatTime(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const value = Math.max(0, Number(seconds ?? 0));
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function PortalPresentationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDeliverableId = searchParams.get("deliverable");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string | null>(initialDeliverableId);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ReviewThread[]>([]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null,
    [versions, selectedVersionId],
  );

  const isVideo = useMemo(() => {
    const type = String(selectedVersion?.file_type ?? "").toLowerCase();
    const url = String(selectedVersion?.file_url ?? "");
    return type.includes("video") || /\.(mp4|mov|m4v|webm)$/i.test(url);
  }, [selectedVersion]);

  const isImage = useMemo(() => {
    const type = String(selectedVersion?.file_type ?? "").toLowerCase();
    const url = String(selectedVersion?.file_url ?? "");
    return type.includes("image") || /\.(png|jpg|jpeg|webp|gif)$/i.test(url);
  }, [selectedVersion]);

  const loadThreads = useCallback(async (versionId: string | null) => {
    if (!versionId) {
      setThreads([]);
      return;
    }
    const response = await fetch(`/api/review/threads?versionId=${encodeURIComponent(versionId)}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { threads?: ReviewThread[]; error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Falha ao carregar comentários");
    }
    setThreads(payload.threads ?? []);
  }, []);

  const loadDeliverable = useCallback(async (deliverableId: string) => {
    const response = await fetch(`/api/review/deliverables/${deliverableId}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      versions?: Version[];
      selectedVersionId?: string | null;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "Falha ao carregar entrega");
    }

    const versionRows = payload.versions ?? [];
    const preferredVersion = payload.selectedVersionId ?? versionRows[0]?.id ?? null;
    setVersions(versionRows);
    setSelectedVersionId(preferredVersion);
    await loadThreads(preferredVersion);
  }, [loadThreads]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/review/deliverables?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { deliverables?: Deliverable[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao carregar entregáveis");
      }

      const rows = payload.deliverables ?? [];
      setDeliverables(rows);

      const deliverableId = initialDeliverableId && rows.some((row) => row.id === initialDeliverableId)
        ? initialDeliverableId
        : rows[0]?.id;

      if (!deliverableId) {
        setSelectedDeliverableId(null);
        setVersions([]);
        setThreads([]);
        return;
      }

      setSelectedDeliverableId(deliverableId);
      await loadDeliverable(deliverableId);
    } catch (loadErr) {
      setError(loadErr instanceof Error ? loadErr.message : "Falha ao abrir modo apresentação");
    } finally {
      setLoading(false);
    }
  }, [initialDeliverableId, loadDeliverable, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSelectDeliverable = async (deliverableId: string) => {
    setSelectedDeliverableId(deliverableId);
    setError(null);
    try {
      await loadDeliverable(deliverableId);
    } catch (loadErr) {
      setError(loadErr instanceof Error ? loadErr.message : "Falha ao trocar entrega");
    }
  };

  const jumpToThread = (thread: ReviewThread) => {
    const video = document.getElementById("portal-presentation-video") as HTMLVideoElement | null;
    if (!video || !Number.isFinite(thread.timecode_seconds)) return;
    video.currentTime = Number(thread.timecode_seconds ?? 0);
    void video.play().catch(() => undefined);
  };

  return (
    <div className="min-h-dvh w-full" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6">
        <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/portal/projects/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" /> Voltar ao projeto
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Modo apresentação</span>
            {deliverables.length > 0 ? (
              <select
                className="input min-w-[240px]"
                value={selectedDeliverableId ?? ""}
                onChange={(event) => void onSelectDeliverable(event.target.value)}
              >
                {deliverables.map((deliverable) => (
                  <option key={deliverable.id} value={deliverable.id}>{deliverable.title}</option>
                ))}
              </select>
            ) : null}
          </div>
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--text-3)" }} />
          </div>
        ) : error ? (
          <div className="card p-6 text-center">
            <p className="text-sm font-semibold">Erro no modo apresentação</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>{error}</p>
            <button className="btn btn-secondary btn-sm mt-4" onClick={() => void load()}>Tentar novamente</button>
          </div>
        ) : !selectedDeliverableId ? (
          <div className="card p-6 text-center">
            <p className="text-sm" style={{ color: "var(--text-2)" }}>Sem entregáveis disponíveis neste projeto.</p>
          </div>
        ) : (
          <div className="grid flex-1 gap-4 lg:grid-cols-[1.65fr_1fr]">
            <section className="card flex min-h-[420px] items-center justify-center overflow-hidden p-2">
              {selectedVersion?.file_url ? (
                isVideo ? (
                  <video id="portal-presentation-video" controls className="max-h-[74vh] w-full rounded-xl bg-black">
                    <source src={selectedVersion.file_url} type={selectedVersion.file_type ?? "video/mp4"} />
                  </video>
                ) : isImage ? (
                  <img src={selectedVersion.file_url} alt="Preview" className="max-h-[74vh] w-full rounded-xl object-contain" />
                ) : (
                  <a className="btn btn-primary" href={selectedVersion.file_url} target="_blank" rel="noreferrer">
                    <PlayCircle className="h-4 w-4" /> Abrir ficheiro
                  </a>
                )
              ) : (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem ficheiro associado a esta versão.</p>
              )}
            </section>

            <aside className="card flex min-h-[420px] flex-col p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Comentários</p>
                <span className="pill text-[11px]">{threads.length} threads</span>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {threads.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem comentários para esta versão.</p>
                ) : threads.map((thread) => (
                  <button
                    key={thread.id}
                    className="w-full rounded-xl border p-3 text-left"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                    onClick={() => jumpToThread(thread)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="pill text-[11px]">{formatTime(thread.timecode_seconds)}</span>
                      <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{thread.status}</span>
                    </div>
                    <p className="mt-2 text-sm line-clamp-2">{thread.review_comments[0]?.body ?? "Sem texto"}</p>
                  </button>
                ))}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
