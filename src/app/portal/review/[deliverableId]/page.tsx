"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AnimatePresence, LayoutGroup } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Loader2,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Plus,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import { buttonMotionProps, useMotionEnabled } from "@/lib/motion";
import { CopyToast, MotionList, MotionListItem, MotionPage, SavedCheckmark } from "@/components/motion-system";
import { useMotionConfig } from "@/lib/motion-config";
import { fireCelebration } from "@/lib/celebration";
import { useOptionalSmoothScroll } from "@/lib/smooth-scroll";

type Version = {
  id: string;
  version?: number | null;
  version_number?: number | null;
  file_url?: string | null;
  file_type?: string | null;
  duration?: number | null;
  notes?: string | null;
  created_at: string;
};

type ReviewComment = {
  id: string;
  thread_id: string;
  body: string;
  created_by: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  created_at: string;
};

type ReviewThread = {
  id: string;
  version_id: string;
  timecode_seconds?: number | null;
  x?: number | null;
  y?: number | null;
  status: "open" | "resolved";
  created_at: string;
  review_comments: ReviewComment[];
};

type Approval = {
  id: string;
  decision: "approved" | "changes_requested" | "rejected";
  approved_at?: string | null;
  created_at: string;
  note?: string | null;
  comment?: string | null;
};

type DeliverablePayload = {
  deliverable: {
    id: string;
    project_id: string;
    title: string;
    description?: string | null;
    status?: string | null;
  };
  versions: Version[];
  selectedVersionId: string | null;
  approvals: Approval[];
  latestFile?: {
    shared_link?: string | null;
    preview_url?: string | null;
    file_type?: string | null;
    filename?: string | null;
  } | null;
  access: {
    canRead: boolean;
    canWrite: boolean;
    canApprove: boolean;
    isClientUser: boolean;
  };
};

function formatTime(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const total = Math.max(0, Math.floor(Number(seconds)));
  const min = Math.floor(total / 60).toString().padStart(2, "0");
  const sec = (total % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function versionLabel(version: Version) {
  const number = version.version_number ?? version.version ?? 1;
  return `v${number}`;
}

function csvEscape(value: string) {
  const normalized = value.replace(/"/g, "\"\"");
  return `"${normalized}"`;
}

export default function PortalReviewPage() {
  const { deliverableId } = useParams<{ deliverableId: string }>();
  const searchParams = useSearchParams();
  const initialVersionId = searchParams.get("v") ?? "";
  const motionEnabled = useMotionEnabled();
  const { enableCelebrations, enableSmoothScroll } = useMotionConfig();

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DeliverablePayload | null>(null);
  const [threads, setThreads] = useState<ReviewThread[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(initialVersionId);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const [newComment, setNewComment] = useState("");
  const [newCommentTimecode, setNewCommentTimecode] = useState<number | null>(null);
  const [replyByThread, setReplyByThread] = useState<Record<string, string>>({});
  const [approvalNote, setApprovalNote] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [sharePassword, setSharePassword] = useState("");
  const [shareDays, setShareDays] = useState(7);
  const [shareSingleUse, setShareSingleUse] = useState(false);
  const [shareRequireAuth, setShareRequireAuth] = useState(false);
  const [shareAllowGuest, setShareAllowGuest] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareVersionId, setCompareVersionId] = useState<string>("");
  const [approvalSigner, setApprovalSigner] = useState("");
  const [approvalSaved, setApprovalSaved] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [approvalChecklist, setApprovalChecklist] = useState({
    sound: false,
    color: false,
    text: false,
    branding: false,
  });

  useOptionalSmoothScroll(enableSmoothScroll);

  const loadThreads = useCallback(async (versionId: string) => {
    const res = await fetch(`/api/review/threads?versionId=${encodeURIComponent(versionId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Falha ao carregar comentários.");
    setThreads(data.threads ?? []);
  }, []);

  const loadDeliverable = useCallback(async (versionId?: string) => {
    setLoading(true);
    setError(null);

    try {
      const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
      const res = await fetch(`/api/review/deliverables/${deliverableId}${query}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar review.");

      setPayload(data);

      const nextVersionId = versionId || data.selectedVersionId || data.versions?.[0]?.id || "";
      setSelectedVersionId(nextVersionId);
      if (nextVersionId) {
        await loadThreads(nextVersionId);
      } else {
        setThreads([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado ao carregar review.");
    } finally {
      setLoading(false);
    }
  }, [deliverableId, loadThreads]);

  useEffect(() => {
    void loadDeliverable(initialVersionId || undefined);
  }, [loadDeliverable, initialVersionId]);

  const currentVersion = useMemo(() => {
    if (!payload) return null;
    return payload.versions.find((version) => version.id === selectedVersionId) ?? payload.versions[0] ?? null;
  }, [payload, selectedVersionId]);

  const compareVersion = useMemo(() => {
    if (!payload || !compareVersionId) return null;
    return payload.versions.find((version) => version.id === compareVersionId) ?? null;
  }, [payload, compareVersionId]);

  useEffect(() => {
    if (!payload || payload.versions.length < 2) return;
    const next = payload.versions.find((version) => version.id !== selectedVersionId);
    if (next) setCompareVersionId((prev) => prev || next.id);
  }, [payload, selectedVersionId]);

  const mediaSrc = currentVersion?.file_url || payload?.latestFile?.shared_link || payload?.latestFile?.preview_url || "";
  const isVideo = String(currentVersion?.file_type || payload?.latestFile?.file_type || "").toLowerCase().includes("video")
    || /\.(mp4|mov|m4v|webm)$/i.test(mediaSrc);
  const approvalChecklistCount = Object.values(approvalChecklist).filter(Boolean).length;

  const exportCommentsCsv = () => {
    if (!payload) return;
    const rows = [
      ["thread_id", "timecode", "status", "comment_id", "author", "created_at", "body"],
      ...threads.flatMap((thread) =>
        thread.review_comments.map((comment) => ([
          thread.id,
          formatTime(thread.timecode_seconds),
          thread.status,
          comment.id,
          comment.guest_name || comment.guest_email || comment.created_by || "user",
          comment.created_at,
          comment.body,
        ])),
      ),
    ];
    const csv = rows
      .map((row) => row.map((cell) => csvEscape(String(cell ?? ""))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${payload.deliverable.title.replace(/\s+/g, "-").toLowerCase()}-comments.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCommentsPdf = () => {
    if (!payload) return;
    const popup = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
    if (!popup) {
      setMessage("Permite pop-ups para exportar PDF.");
      return;
    }
    const rows = threads.map((thread) => `
      <section style=\"border:1px solid #d7dde8;border-radius:12px;padding:12px;margin-bottom:12px;\">
        <h3 style=\"margin:0 0 6px 0;font:600 14px sans-serif;\">Thread ${thread.id.slice(0, 8)} · ${formatTime(thread.timecode_seconds)} · ${thread.status}</h3>
        ${thread.review_comments
          .map((comment) => `
            <div style=\"margin:0 0 8px 0;padding:8px;border-radius:8px;background:#f6f7fb;\">
              <p style=\"margin:0 0 4px 0;font:500 12px sans-serif;\">${comment.guest_name || comment.guest_email || comment.created_by || "user"} · ${new Date(comment.created_at).toLocaleString("pt-PT")}</p>
              <p style=\"margin:0;font:400 12px/1.45 sans-serif;white-space:pre-wrap;\">${comment.body.replace(/[<>]/g, "")}</p>
            </div>
          `)
          .join("")}
      </section>
    `).join("");
    popup.document.write(`
      <html>
        <head>
          <title>Review Export</title>
        </head>
        <body style=\"font-family: Inter, system-ui, sans-serif; padding: 24px; color: #111;\">
          <h1 style=\"margin:0 0 6px 0;\">${payload.deliverable.title.replace(/[<>]/g, "")}</h1>
          <p style=\"margin:0 0 16px 0;color:#4a5568;\">Exportado em ${new Date().toLocaleString("pt-PT")}</p>
          ${rows || "<p>Sem comentários.</p>"}
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const jumpToThread = (thread: ReviewThread) => {
    setSelectedThreadId(thread.id);
    const seconds = thread.timecode_seconds;
    if (isVideo && videoRef.current && Number.isFinite(seconds)) {
      videoRef.current.currentTime = Number(seconds);
      void videoRef.current.play().catch(() => undefined);
    }
  };

  const createThread = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedVersionId || !newComment.trim()) return;

    setBusyAction("create-thread");
    setMessage(null);
    try {
      const body = {
        versionId: selectedVersionId,
        body: newComment.trim(),
        timecodeSeconds: newCommentTimecode,
      };
      const res = await fetch("/api/review/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar thread.");

      setNewComment("");
      setNewCommentTimecode(null);
      await loadThreads(selectedVersionId);
      setMessage("Comentário registado com sucesso.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao criar comentário.");
    } finally {
      setBusyAction(null);
    }
  };

  const createReply = async (threadId: string) => {
    const text = (replyByThread[threadId] ?? "").trim();
    if (!text) return;

    setBusyAction(`reply-${threadId}`);
    setMessage(null);
    try {
      const res = await fetch("/api/review/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao responder.");

      setReplyByThread((prev) => ({ ...prev, [threadId]: "" }));
      if (selectedVersionId) await loadThreads(selectedVersionId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao responder.");
    } finally {
      setBusyAction(null);
    }
  };

  const toggleThreadStatus = async (threadId: string, status: "open" | "resolved") => {
    setBusyAction(`thread-${threadId}`);
    try {
      const res = await fetch(`/api/review/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao atualizar thread.");
      if (selectedVersionId) await loadThreads(selectedVersionId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao atualizar thread.");
    } finally {
      setBusyAction(null);
    }
  };

  const submitApproval = async (decision: "approved" | "changes_requested") => {
    if (!payload || !selectedVersionId) return;
    if (decision === "approved") {
      if (approvalChecklistCount < 4) {
        setMessage("Completa o checklist de aprovação antes de aprovar.");
        return;
      }
      if (!approvalSigner.trim()) {
        setMessage("Adiciona a assinatura para finalizar a aprovação.");
        return;
      }
    }

    setBusyAction(`approval-${decision}`);
    setMessage(null);
    try {
      const checklistSummary = `Checklist: som=${approvalChecklist.sound ? "ok" : "nok"}, cor=${approvalChecklist.color ? "ok" : "nok"}, textos=${approvalChecklist.text ? "ok" : "nok"}, branding=${approvalChecklist.branding ? "ok" : "nok"}`;
      const signatureSummary = approvalSigner.trim() ? `Assinatura: ${approvalSigner.trim()}` : "";
      const fullNote = [
        approvalNote.trim(),
        checklistSummary,
        signatureSummary,
      ].filter(Boolean).join("\n");

      const res = await fetch("/api/review/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliverableId: payload.deliverable.id,
          versionId: selectedVersionId,
          decision,
          note: fullNote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao registar decisão.");

      setApprovalNote("");
      setApprovalSigner("");
      setApprovalChecklist({ sound: false, color: false, text: false, branding: false });
      setMessage(decision === "approved" ? "Versão aprovada." : "Pedido de alterações enviado.");
      setApprovalSaved(decision === "approved");
      if (decision === "approved") {
        await fireCelebration("deliverable_approved", enableCelebrations);
        window.setTimeout(() => setApprovalSaved(false), 2200);
      }
      await loadDeliverable(selectedVersionId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao registar aprovação.");
    } finally {
      setBusyAction(null);
    }
  };

  const createTaskFromThread = async (threadId: string) => {
    setBusyAction(`task-${threadId}`);
    setMessage(null);
    try {
      const res = await fetch("/api/review/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar tarefa.");
      setMessage(`Tarefa criada: ${data.task?.title ?? "review follow-up"}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao criar tarefa.");
    } finally {
      setBusyAction(null);
    }
  };

  const generateShareLink = async () => {
    if (!payload) return;

    setBusyAction("share-link");
    setMessage(null);
    try {
      const res = await fetch("/api/review/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliverableId: payload.deliverable.id,
          expiresInDays: shareDays,
          password: sharePassword || undefined,
          singleUse: shareSingleUse,
          requireAuth: shareRequireAuth,
          allowGuestComments: shareAllowGuest,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar link de review.");

      setShareUrl(data.shareUrl);
      setMessage("Review link criado.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao criar review link.");
    } finally {
      setBusyAction(null);
    }
  };

  const copyShareLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShowCopyToast(true);
    window.setTimeout(() => setShowCopyToast(false), 1500);
    setMessage("Link copiado para a área de transferência.");
  };

  const renderVersionPreview = (version: Version | null, options?: { useFallback?: boolean; attachVideoRef?: boolean }) => {
    const src = version?.file_url
      || (options?.useFallback ? payload?.latestFile?.shared_link || payload?.latestFile?.preview_url || "" : "");
    const kind = String(version?.file_type ?? "").toLowerCase();
    const video = kind.includes("video") || /\.(mp4|mov|m4v|webm)$/i.test(src);
    const image = kind.includes("image") || /\.(jpg|jpeg|png|gif|webp)$/i.test(src);

    if (!src) {
      return (
        <div className="flex min-h-[260px] items-center justify-center p-8 text-sm" style={{ color: "var(--text-2)" }}>
          Sem ficheiro associado nesta versão.
        </div>
      );
    }

    if (video) {
      return (
        <video
          ref={options?.attachVideoRef ? videoRef : undefined}
          controls
          preload="metadata"
          className="max-h-[520px] w-full bg-black"
        >
          <source src={src} type="video/mp4" />
        </video>
      );
    }

    if (image) {
      return (
        <img src={src} alt={payload?.deliverable.title ?? "Review media"} className="max-h-[520px] w-full object-contain" />
      );
    }

    return (
      <div className="flex min-h-[260px] items-center justify-center p-8 text-sm" style={{ color: "var(--text-2)" }}>
        <FileText className="mr-2 h-4 w-4" /> Sem preview direta para este ficheiro.
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar review...
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="mx-auto max-w-3xl rounded-[24px] border p-6 card-glass" style={{ borderColor: "var(--border-soft)" }}>
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertCircle className="h-4 w-4" /> {error ?? "Falha ao carregar review."}
        </div>
        <button className="btn btn-secondary mt-4" onClick={() => void loadDeliverable(selectedVersionId || undefined)}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <MotionPage className="space-y-5">
      <LayoutGroup id="portal-review-layout">
      <header className="card-glass rounded-[28px] border px-5 py-4 md:px-6" style={{ borderColor: "var(--border-soft)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.12em]" style={{ color: "var(--text-3)" }}>
              Review & Approvals
            </p>
            <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em]" style={{ color: "var(--text)" }}>
              {payload.deliverable.title}
            </h1>
            <p className="text-xs" style={{ color: "var(--text-2)" }}>
              Estado atual: <strong>{payload.deliverable.status ?? "pending"}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/portal/projects/${payload.deliverable.project_id}`} className="btn btn-secondary btn-sm">
              Voltar ao projeto
            </Link>
            {mediaSrc ? (
              <a className="btn btn-secondary btn-sm" href={mediaSrc} target="_blank" rel="noopener noreferrer">
                Abrir ficheiro <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>
      </header>

      {message ? (
        <div className="alert">
          <Sparkles className="h-4 w-4" />
          <span>{message}</span>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.9fr)]">
        <section className="space-y-5">
          <div className="card rounded-[24px] p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="pill">Versão</span>
                <select
                  className="input h-9 min-w-[140px] text-sm"
                  value={selectedVersionId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedVersionId(value);
                    void loadDeliverable(value);
                  }}
                >
                  {payload.versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {versionLabel(version)} · {new Date(version.created_at).toLocaleDateString("pt-PT")}
                    </option>
                  ))}
                </select>
                {payload.versions.length > 1 ? (
                  <label className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-2)" }}>
                    <input
                      type="checkbox"
                      checked={compareEnabled}
                      onChange={(event) => setCompareEnabled(event.target.checked)}
                    />
                    Comparar versões
                  </label>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {compareEnabled && payload.versions.length > 1 ? (
                  <select
                    className="input h-9 min-w-[132px] text-sm"
                    value={compareVersionId}
                    onChange={(event) => setCompareVersionId(event.target.value)}
                  >
                    {payload.versions
                      .filter((version) => version.id !== selectedVersionId)
                      .map((version) => (
                        <option key={version.id} value={version.id}>
                          {versionLabel(version)}
                        </option>
                      ))}
                  </select>
                ) : null}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const current = videoRef.current;
                    if (!current) return;
                    const seconds = Number(current.currentTime ?? 0);
                    setNewCommentTimecode(seconds);
                  }}
                  disabled={!isVideo}
                  {...buttonMotionProps({ enabled: motionEnabled })}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Marcar timecode
                </button>
              </div>
            </div>

            {compareEnabled && compareVersion ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: "var(--border)" }}>
                  <div className="border-b px-3 py-2 text-xs font-medium" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                    {currentVersion ? versionLabel(currentVersion) : "Atual"}
                  </div>
                  {renderVersionPreview(currentVersion, { useFallback: true, attachVideoRef: true })}
                </div>
                <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: "var(--border)" }}>
                  <div className="border-b px-3 py-2 text-xs font-medium" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                    {versionLabel(compareVersion)}
                  </div>
                  {renderVersionPreview(compareVersion)}
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: "var(--border)" }}>
                {renderVersionPreview(currentVersion, { useFallback: true, attachVideoRef: true })}
              </div>
            )}

            <form onSubmit={createThread} className="mt-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
                <span className="pill">Novo comentário</span>
                <span className="inline-flex items-center gap-1">
                  <PlayCircle className="h-3.5 w-3.5" /> {formatTime(newCommentTimecode)}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={newComment}
                  onChange={(event) => setNewComment(event.target.value)}
                  placeholder="Adicionar comentário no ponto atual"
                />
                <button className="btn btn-primary" disabled={!newComment.trim() || busyAction === "create-thread"}>
                  {busyAction === "create-thread" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </form>
          </div>

          {payload.access.canApprove ? (
            <div className="card rounded-[24px] p-4 md:p-5">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Aprovação da versão
              </h2>
              <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                Regista decisão formal com nota opcional e audit trail.
              </p>

              <textarea
                className="input mt-3 min-h-24 w-full"
                placeholder="Nota opcional (ex: pedido de ajustes em legendas)"
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
              />

              <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                  Checklist de aprovação ({approvalChecklistCount}/4)
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs" style={{ color: "var(--text-2)" }}>
                  {[
                    { key: "sound", label: "Som validado" },
                    { key: "color", label: "Cor validada" },
                    { key: "text", label: "Textos/legendas" },
                    { key: "branding", label: "Branding aprovado" },
                  ].map((item) => {
                    const key = item.key as keyof typeof approvalChecklist;
                    return (
                      <label key={item.key} className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={approvalChecklist[key]}
                          onChange={(event) => setApprovalChecklist((prev) => ({ ...prev, [key]: event.target.checked }))}
                        />
                        {item.label}
                      </label>
                    );
                  })}
                </div>
                <label className="label mt-3">
                  Assinatura
                  <input
                    className="input mt-1 h-9 w-full"
                    value={approvalSigner}
                    onChange={(event) => setApprovalSigner(event.target.value)}
                    placeholder="Nome da pessoa que aprova"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="btn btn-primary"
                  disabled={busyAction === "approval-approved" || approvalChecklistCount < 4 || !approvalSigner.trim()}
                  onClick={() => void submitApproval("approved")}
                >
                  {busyAction === "approval-approved" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Aprovar versão
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={busyAction === "approval-changes_requested"}
                  onClick={() => void submitApproval("changes_requested")}
                >
                  {busyAction === "approval-changes_requested" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Pedir alterações
                </button>
              </div>
              <div className="mt-2">
                <SavedCheckmark show={approvalSaved} label="Approval guardada" />
              </div>

              {payload.approvals.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {payload.approvals.slice(0, 3).map((approval) => (
                    <div key={approval.id} className="flex items-start justify-between rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                          {approval.decision === "approved" ? "Aprovado" : approval.decision === "changes_requested" ? "Alterações pedidas" : "Rejeitado"}
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>
                          {new Date(approval.approved_at ?? approval.created_at).toLocaleString("pt-PT")}
                        </p>
                        {(approval.note || approval.comment) ? (
                          <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
                            {approval.note ?? approval.comment}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="space-y-5">
          <div className="card rounded-[24px] p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  Threads
                </h2>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  {threads.length} discussões nesta versão.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-secondary btn-sm" onClick={exportCommentsCsv}>
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </button>
                <button className="btn btn-secondary btn-sm" onClick={exportCommentsPdf}>
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </button>
              </div>
            </div>

            <MotionList className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
              {threads.length === 0 ? (
                <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                  Sem comentários nesta versão.
                </div>
              ) : (
                <AnimatePresence initial={false}>
                {threads.map((thread) => {
                  const firstComment = thread.review_comments[0];
                  const isSelected = selectedThreadId === thread.id;
                  const resolving = busyAction === `thread-${thread.id}`;
                  const replying = busyAction === `reply-${thread.id}`;

                  return (
                    <MotionListItem
                      key={thread.id}
                      kind="list"
                      className="rounded-2xl border p-3"
                      style={{ borderColor: isSelected ? "var(--accent-primary)" : "var(--border)" }}
                    >
                      <button className="w-full text-left" onClick={() => jumpToThread(thread)}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="pill text-[11px]">{formatTime(thread.timecode_seconds)}</span>
                          <span className="text-[11px]" style={{ color: thread.status === "resolved" ? "#10b981" : "var(--text-3)" }}>
                            {thread.status === "resolved" ? "Resolvido" : "Aberto"}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm" style={{ color: "var(--text)" }}>
                          {firstComment?.body ?? "Thread sem comentário"}
                        </p>
                      </button>

                      <div className="mt-2 space-y-1">
                        {thread.review_comments.slice(1).map((comment) => (
                          <p key={comment.id} className="rounded-xl bg-[var(--surface-2)] px-2.5 py-2 text-xs" style={{ color: "var(--text-2)" }}>
                            {comment.body}
                          </p>
                        ))}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => void toggleThreadStatus(thread.id, thread.status === "resolved" ? "open" : "resolved")}
                          disabled={resolving}
                        >
                          {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          {thread.status === "resolved" ? "Reabrir" : "Resolver"}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => void createTaskFromThread(thread.id)}
                          disabled={busyAction === `task-${thread.id}`}
                        >
                          {busyAction === `task-${thread.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
                          Criar tarefa
                        </button>
                      </div>

                      <div className="mt-2 flex gap-2">
                        <input
                          className="input h-9 flex-1 text-xs"
                          placeholder="Responder..."
                          value={replyByThread[thread.id] ?? ""}
                          onChange={(event) => setReplyByThread((prev) => ({ ...prev, [thread.id]: event.target.value }))}
                        />
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={!(replyByThread[thread.id] ?? "").trim() || replying}
                          onClick={() => void createReply(thread.id)}
                        >
                          {replying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </MotionListItem>
                  );
                })}
                </AnimatePresence>
              )}
            </MotionList>
          </div>

          {payload.access.canWrite ? (
            <div className="card rounded-[24px] p-4 md:p-5">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Share review link
              </h2>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                Token seguro com expiração e controlo de comentários guest.
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="label">
                  Expira (dias)
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={shareDays}
                    onChange={(event) => setShareDays(Number(event.target.value || 7))}
                    className="input mt-1 h-9 w-full"
                  />
                </label>
                <label className="label">
                  Password (opcional)
                  <input
                    type="password"
                    value={sharePassword}
                    onChange={(event) => setSharePassword(event.target.value)}
                    className="input mt-1 h-9 w-full"
                    placeholder="••••••••"
                  />
                </label>
              </div>

              <div className="mt-2 grid gap-1.5 text-xs" style={{ color: "var(--text-2)" }}>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={shareSingleUse} onChange={(event) => setShareSingleUse(event.target.checked)} />
                  Single-use
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={shareRequireAuth} onChange={(event) => setShareRequireAuth(event.target.checked)} />
                  Exigir autenticação
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={shareAllowGuest} onChange={(event) => setShareAllowGuest(event.target.checked)} />
                  Permitir comentários guest
                </label>
              </div>

              <button className="btn btn-primary mt-3 w-full" onClick={() => void generateShareLink()} disabled={busyAction === "share-link"}>
                {busyAction === "share-link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Gerar review link
              </button>

              {shareUrl ? (
                <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <p className="text-xs break-all" style={{ color: "var(--text-2)" }}>{shareUrl}</p>
                  <div className="mt-2 flex gap-2">
                    <button className="btn btn-secondary btn-sm" onClick={() => void copyShareLink()}>
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </button>
                    <a className="btn btn-secondary btn-sm" href={shareUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      <div className="text-xs" style={{ color: "var(--text-3)" }}>
        <span className="inline-flex items-center gap-1"><PauseCircle className="h-3.5 w-3.5" /> Estado estável: loading/error/empty tratados.</span>
      </div>
      <CopyToast show={showCopyToast} />
      </LayoutGroup>
    </MotionPage>
  );
}
