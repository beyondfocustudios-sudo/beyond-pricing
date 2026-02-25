"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Lock, MessageSquare, Send } from "lucide-react";

type Version = {
  id: string;
  version?: number | null;
  version_number?: number | null;
  file_url?: string | null;
  file_type?: string | null;
  created_at: string;
};

type Thread = {
  id: string;
  timecode_seconds?: number | null;
  status: "open" | "resolved";
  review_comments: Array<{
    id: string;
    body: string;
    guest_name?: string | null;
    created_at: string;
  }>;
};

type LinkPayload = {
  deliverable: {
    id: string;
    title: string;
    status?: string | null;
  };
  link: {
    expiresAt: string;
    hasPassword: boolean;
    allowGuestComments: boolean;
  };
  versions: Version[];
  selectedVersionId: string | null;
  threads: Thread[];
};

function formatTime(seconds?: number | null) {
  if (!Number.isFinite(seconds)) return "--:--";
  const total = Math.max(0, Math.floor(Number(seconds)));
  const min = Math.floor(total / 60).toString().padStart(2, "0");
  const sec = (total % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export default function PublicReviewLinkPage() {
  const { token } = useParams<{ token: string }>();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");

  const [data, setData] = useState<LinkPayload | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState("");

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (versionId?: string) => {
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    if (password) query.set("password", password);
    if (versionId) query.set("versionId", versionId);

    const res = await fetch(`/api/review-link/${token}?${query.toString()}`, { cache: "no-store" });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setRequiresPassword(Boolean(payload.requiresPassword));
      setError(payload.error ?? "Falha ao abrir review link.");
      setLoading(false);
      return;
    }

    setRequiresPassword(false);
    setData(payload);
    setSelectedVersionId(versionId || payload.selectedVersionId || payload.versions?.[0]?.id || "");
    setLoading(false);
  }, [password, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentVersion = useMemo(() => {
    if (!data) return null;
    return data.versions.find((version) => version.id === selectedVersionId) ?? data.versions[0] ?? null;
  }, [data, selectedVersionId]);

  const source = currentVersion?.file_url || "";
  const fileType = (currentVersion?.file_type || "").toLowerCase();
  const isVideo = fileType.includes("video") || /\.(mp4|mov|webm)$/i.test(source);
  const isImage = fileType.includes("image") || /\.(jpg|jpeg|png|gif|webp)$/i.test(source);

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!data || !selectedVersionId || !comment.trim()) return;

    setSubmitting(true);
    setMessage(null);

    const timecode = videoRef.current ? Number(videoRef.current.currentTime ?? 0) : null;

    const res = await fetch(`/api/review-link/${token}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionId: selectedVersionId,
        body: comment,
        name: guestName,
        email: guestEmail,
        password,
        timecodeSeconds: timecode,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(payload.error ?? "Falha ao enviar comentário.");
      setSubmitting(false);
      return;
    }

    setComment("");
    setMessage("Comentário enviado com sucesso.");
    await load(selectedVersionId);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="super-theme super-shell-bg min-h-dvh flex items-center justify-center">
        <div className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar review link...
        </div>
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div className="super-theme super-shell-bg min-h-dvh px-4 py-8">
        <div className="mx-auto max-w-md card-glass rounded-[28px] border p-6" style={{ borderColor: "var(--border-soft)" }}>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Review protegido</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
            Este link exige password para acesso.
          </p>
          <label className="label mt-4">Password</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
            <input
              type="password"
              className="input w-full pl-9"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Introduz password"
            />
          </div>
          {error ? (
            <div className="alert alert-error mt-3">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : null}
          <button className="btn btn-primary mt-4 w-full" onClick={() => void load(selectedVersionId || undefined)}>
            Entrar no review
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="super-theme super-shell-bg min-h-dvh px-4 py-8">
        <div className="mx-auto max-w-xl card-glass rounded-[28px] border p-6" style={{ borderColor: "var(--border-soft)" }}>
          <div className="alert alert-error">
            <AlertCircle className="h-4 w-4" />
            <span>{error ?? "Não foi possível abrir o review."}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="super-theme super-shell-bg min-h-dvh px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto grid max-w-6xl gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <section className="card-glass rounded-[28px] border p-4 md:p-5" style={{ borderColor: "var(--border-soft)" }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>{data.deliverable.title}</h1>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                Expira em {new Date(data.link.expiresAt).toLocaleDateString("pt-PT")}
              </p>
            </div>

            <select
              className="input h-9 min-w-[140px] text-sm"
              value={selectedVersionId}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedVersionId(value);
                void load(value);
              }}
            >
              {data.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version_number ?? version.version ?? 1}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: "var(--border)" }}>
            {source ? (
              isVideo ? (
                <video ref={videoRef} controls className="max-h-[560px] w-full bg-black">
                  <source src={source} type="video/mp4" />
                </video>
              ) : isImage ? (
                <img src={source} alt={data.deliverable.title} className="max-h-[560px] w-full object-contain" />
              ) : (
                <div className="flex min-h-[260px] items-center justify-center p-8 text-sm" style={{ color: "var(--text-2)" }}>
                  Preview indisponível, abre o ficheiro externo.
                </div>
              )
            ) : (
              <div className="flex min-h-[260px] items-center justify-center p-8 text-sm" style={{ color: "var(--text-2)" }}>
                Sem ficheiro para esta versão.
              </div>
            )}
          </div>

          {source ? (
            <a className="btn btn-secondary btn-sm mt-3" href={source} target="_blank" rel="noopener noreferrer">
              Abrir ficheiro <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}

          <form onSubmit={submitComment} className="mt-4 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input h-9" placeholder="Nome" value={guestName} onChange={(event) => setGuestName(event.target.value)} />
              <input className="input h-9" placeholder="Email (opcional)" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} />
            </div>
            <textarea
              className="input min-h-24 w-full"
              placeholder="Adicionar comentário neste ponto"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            <button className="btn btn-primary" disabled={submitting || !comment.trim() || !data.link.allowGuestComments}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar comentário
            </button>
          </form>

          {message ? (
            <div className="alert mt-3">
              <CheckCircle2 className="h-4 w-4" />
              <span>{message}</span>
            </div>
          ) : null}
        </section>

        <aside className="card-glass rounded-[28px] border p-4 md:p-5" style={{ borderColor: "var(--border-soft)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Comentários</h2>
          <div className="mt-3 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            {data.threads.length === 0 ? (
              <div className="rounded-2xl border p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                Sem comentários nesta versão.
              </div>
            ) : (
              data.threads.map((thread) => (
                <div key={thread.id} className="rounded-2xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-3)" }}>
                    <span>{formatTime(thread.timecode_seconds)}</span>
                    <span>{thread.status === "resolved" ? "Resolvido" : "Aberto"}</span>
                  </div>
                  {thread.review_comments.map((entry) => (
                    <div key={entry.id} className="mt-2 rounded-xl bg-[var(--surface-2)] px-2.5 py-2">
                      <p className="text-xs" style={{ color: "var(--text-2)" }}>{entry.body}</p>
                      <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                        <MessageSquare className="mr-1 inline h-3 w-3" />
                        {entry.guest_name || "Utilizador"} · {new Date(entry.created_at).toLocaleString("pt-PT")}
                      </p>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
