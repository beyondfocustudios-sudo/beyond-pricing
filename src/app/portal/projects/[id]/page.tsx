"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Clock, Film, Image, FileText, Music,
  ExternalLink, CheckCircle, XCircle, MessageSquare, Package,
  RefreshCw
} from "lucide-react";
import Link from "next/link";

interface ProjectDetail {
  id: string;
  project_name: string;
  client_name: string;
  status: string;
  updated_at: string;
  created_at: string;
  inputs: Record<string, unknown>;
}

interface DeliverableFile {
  id: string;
  filename: string;
  ext: string;
  file_type: string;
  collection: string;
  shared_link: string | null;
  bytes: number | null;
  captured_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

type Tab = "overview" | "deliveries" | "approvals";

const FILE_TYPE_ICON = {
  photo:    { icon: Image,    color: "#1a8fa3", label: "Fotos" },
  video:    { icon: Film,     color: "#7c3aed", label: "Vídeos" },
  document: { icon: FileText, color: "#d97706", label: "Documentos" },
  audio:    { icon: Music,    color: "#34a853", label: "Áudio" },
  other:    { icon: Package,  color: "#86868b", label: "Outros" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  rascunho:  { label: "Em Preparação", color: "#86868b", bg: "rgba(134,134,139,0.12)" },
  enviado:   { label: "Em Revisão",    color: "#1a8fa3", bg: "rgba(26,143,163,0.12)" },
  aprovado:  { label: "Aprovado",      color: "#34a853", bg: "rgba(52,168,83,0.12)" },
  cancelado: { label: "Cancelado",     color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
  arquivado: { label: "Arquivado",     color: "#86868b", bg: "rgba(134,134,139,0.08)" },
};

function fmtBytes(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PortalProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [files, setFiles] = useState<DeliverableFile[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCollection, setFilterCollection] = useState<string>("all");
  const [feedbackText, setFeedbackText] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.push("/portal/login"); return; }

    // Fetch project (RLS enforces access)
    const { data: proj, error } = await sb
      .from("projects")
      .select("id, project_name, client_name, status, updated_at, created_at, inputs")
      .eq("id", id)
      .single();

    if (error || !proj) {
      router.push("/portal");
      return;
    }

    setProject(proj as ProjectDetail);

    // Fetch deliverable files
    const { data: filesData } = await sb
      .from("deliverable_files")
      .select("id, filename, ext, file_type, collection, shared_link, bytes, captured_at, created_at, metadata")
      .eq("project_id", id)
      .order("captured_at", { ascending: false });

    setFiles((filesData ?? []) as DeliverableFile[]);
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // Derived collections
  const collections = ["all", ...Array.from(new Set(files.map((f) => f.collection ?? "Geral").filter(Boolean)))];
  const fileTypes   = ["all", ...Array.from(new Set(files.map((f) => f.file_type)))];

  const visibleFiles = files.filter((f) => {
    const typeOk = filterType === "all" || f.file_type === filterType;
    const colOk  = filterCollection === "all" || (f.collection ?? "Geral") === filterCollection;
    return typeOk && colOk;
  });

  // Group by collection for the grid view
  const grouped = visibleFiles.reduce<Record<string, DeliverableFile[]>>((acc, f) => {
    const col = f.collection ?? "Geral";
    (acc[col] ??= []).push(f);
    return acc;
  }, {});

  const handleFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;
    setSubmittingFeedback(true);

    const sb = createClient();
    await sb.from("audit_log").insert({
      action: "client.feedback",
      entity: "projects",
      entity_id: id,
      meta: { message: feedbackText },
    });

    setFeedbackDone(true);
    setFeedbackText("");
    setSubmittingFeedback(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#1a8fa3", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!project) return null;

  const st = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.rascunho;

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview",   label: "Visão Geral" },
    { key: "deliveries", label: `Entregas${files.length > 0 ? ` (${files.length})` : ""}` },
    { key: "approvals",  label: "Aprovações" },
  ];

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div>
        <Link
          href="/portal"
          className="inline-flex items-center gap-1.5 text-sm mb-4 transition-opacity hover:opacity-70"
          style={{ color: "#1a8fa3" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Todos os projetos
        </Link>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "#1d1d1f" }}>
              {project.project_name}
            </h1>
            {project.client_name && (
              <p className="text-sm mt-0.5" style={{ color: "#86868b" }}>{project.client_name}</p>
            )}
          </div>
          <span
            className="inline-flex shrink-0 items-center px-3 py-1 rounded-full text-xs font-medium mt-1"
            style={{ background: st.bg, color: st.color }}
          >
            {st.label}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl"
        style={{ background: "rgba(0,0,0,0.06)" }}
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: tab === key ? "rgba(255,255,255,0.9)" : "transparent",
              color: tab === key ? "#1d1d1f" : "#86868b",
              boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Info cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Ficheiros", value: files.length.toString() },
                { label: "Última atualização", value: fmtDate(project.updated_at ?? project.created_at) },
                { label: "Estado", value: st.label },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl p-4"
                  style={{ background: "rgba(255,255,255,0.78)", backdropFilter: "blur(20px)", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
                >
                  <p className="text-xs" style={{ color: "#86868b" }}>{item.label}</p>
                  <p className="text-lg font-semibold mt-0.5" style={{ color: "#1d1d1f" }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* File type breakdown */}
            {files.length > 0 && (
              <div
                className="rounded-2xl p-5"
                style={{ background: "rgba(255,255,255,0.78)", backdropFilter: "blur(20px)", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
              >
                <p className="text-sm font-semibold mb-4" style={{ color: "#1d1d1f" }}>Tipos de ficheiro</p>
                <div className="space-y-3">
                  {Object.entries(FILE_TYPE_ICON).map(([type, cfg]) => {
                    const count = files.filter((f) => f.file_type === type).length;
                    if (count === 0) return null;
                    const Icon = cfg.icon;
                    const pct = Math.round((count / files.length) * 100);
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                            <span className="text-xs" style={{ color: "#1d1d1f" }}>{cfg.label}</span>
                          </div>
                          <span className="text-xs" style={{ color: "#86868b" }}>{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
                          <motion.div
                            className="h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            style={{ background: cfg.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Description */}
            {typeof project.inputs?.descricao === "string" && project.inputs.descricao && (
              <div
                className="rounded-2xl p-5"
                style={{ background: "rgba(255,255,255,0.78)", backdropFilter: "blur(20px)", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
              >
                <p className="text-sm font-semibold mb-2" style={{ color: "#1d1d1f" }}>Descrição</p>
                <p className="text-sm" style={{ color: "#3d3d3d", lineHeight: 1.6 }}>
                  {project.inputs.descricao}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {tab === "deliveries" && (
          <motion.div
            key="deliveries"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {files.length === 0 ? (
              <div
                className="rounded-2xl p-12 text-center"
                style={{ background: "rgba(255,255,255,0.78)", backdropFilter: "blur(20px)" }}
              >
                <Package className="h-10 w-10 mx-auto mb-3" style={{ color: "#86868b" }} />
                <p className="text-sm font-medium" style={{ color: "#1d1d1f" }}>Sem entregas ainda</p>
                <p className="text-xs mt-1" style={{ color: "#86868b" }}>
                  Os ficheiros aparecerão aqui quando forem carregados pela equipa.
                </p>
              </div>
            ) : (
              <>
                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                  {/* Type filter */}
                  <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(0,0,0,0.06)" }}>
                    {fileTypes.map((t) => {
                      const cfg = FILE_TYPE_ICON[t as keyof typeof FILE_TYPE_ICON];
                      return (
                        <button
                          key={t}
                          onClick={() => setFilterType(t)}
                          className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: filterType === t ? "rgba(255,255,255,0.9)" : "transparent",
                            color: filterType === t ? "#1d1d1f" : "#86868b",
                          }}
                        >
                          {t === "all" ? "Todos" : (cfg?.label ?? t)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Collection filter */}
                  {collections.length > 2 && (
                    <div className="flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: "rgba(0,0,0,0.06)" }}>
                      {collections.map((c) => (
                        <button
                          key={c}
                          onClick={() => setFilterCollection(c)}
                          className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: filterCollection === c ? "rgba(255,255,255,0.9)" : "transparent",
                            color: filterCollection === c ? "#1d1d1f" : "#86868b",
                          }}
                        >
                          {c === "all" ? "Todas as coleções" : c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Files grouped by collection */}
                {Object.entries(grouped).map(([col, colFiles]) => (
                  <div key={col} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#86868b" }}>
                      {col}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {colFiles.map((f) => {
                        const cfg = FILE_TYPE_ICON[f.file_type as keyof typeof FILE_TYPE_ICON] ?? FILE_TYPE_ICON.other;
                        const Icon = cfg.icon;
                        return (
                          <div
                            key={f.id}
                            className="rounded-xl p-3.5 flex items-center gap-3"
                            style={{
                              background: "rgba(255,255,255,0.78)",
                              backdropFilter: "blur(20px)",
                              boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
                              border: "1px solid rgba(255,255,255,0.6)",
                            }}
                          >
                            <div
                              className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                              style={{ background: `${cfg.color}15` }}
                            >
                              <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: "#1d1d1f" }}>
                                {f.filename}
                              </p>
                              <p className="text-xs" style={{ color: "#86868b" }}>
                                {f.ext?.toUpperCase()}
                                {f.bytes ? ` · ${fmtBytes(f.bytes)}` : ""}
                              </p>
                            </div>
                            {f.shared_link && (
                              <a
                                href={f.shared_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                                style={{ background: "rgba(26,143,163,0.1)", color: "#1a8fa3" }}
                              >
                                <ExternalLink className="h-3 w-3" />
                                Ver
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </motion.div>
        )}

        {tab === "approvals" && (
          <motion.div
            key="approvals"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div
              className="rounded-2xl p-6"
              style={{ background: "rgba(255,255,255,0.78)", backdropFilter: "blur(20px)", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
            >
              <div className="flex items-center gap-3 mb-5">
                <MessageSquare className="h-5 w-5" style={{ color: "#1a8fa3" }} />
                <h2 className="text-base font-semibold" style={{ color: "#1d1d1f" }}>
                  Feedback & Aprovação
                </h2>
              </div>

              {project.status === "aprovado" ? (
                <div className="flex items-center gap-3 py-4">
                  <CheckCircle className="h-6 w-6 shrink-0" style={{ color: "#34a853" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#1d1d1f" }}>Projeto aprovado</p>
                    <p className="text-xs mt-0.5" style={{ color: "#86868b" }}>Este projeto foi aprovado pela equipa.</p>
                  </div>
                </div>
              ) : feedbackDone ? (
                <div className="flex items-center gap-3 py-4">
                  <CheckCircle className="h-6 w-6 shrink-0" style={{ color: "#34a853" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#1d1d1f" }}>Feedback enviado!</p>
                    <p className="text-xs mt-0.5" style={{ color: "#86868b" }}>A equipa será notificada.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleFeedback} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium" style={{ color: "#1d1d1f" }}>
                      A tua mensagem
                    </label>
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Escreve aqui o teu feedback, revisões ou aprovação…"
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                      style={{
                        background: "rgba(0,0,0,0.04)",
                        border: "1px solid rgba(0,0,0,0.1)",
                        color: "#1d1d1f",
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={submittingFeedback || !feedbackText.trim()}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                      style={{
                        background: submittingFeedback || !feedbackText.trim()
                          ? "rgba(134,134,139,0.4)"
                          : "linear-gradient(135deg, #1a8fa3, #0d6b7e)",
                      }}
                    >
                      {submittingFeedback ? "A enviar…" : "Enviar feedback"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
