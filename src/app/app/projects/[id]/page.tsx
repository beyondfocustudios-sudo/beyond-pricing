"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { calcularOrcamento } from "@/lib/calc";
import { fmtEur, fmt, generateId } from "@/lib/utils";
import {
  CATEGORIAS,
  IVA_REGIMES,
  PROJECT_STATUS,
  type ProjectItem,
  type ProjectInputs,
  type ProjectCalc,
  type Categoria,
  type IvaRegime,
  type ProjectStatus,
} from "@/lib/types";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Download,
  ChevronDown,
  ChevronUp,
  Check,
  Edit2,
  Film,
  Image,
  FileText,
  Music,
  Package,
  RefreshCw,
  ExternalLink,
  FolderOpen,
  Settings2,
  Presentation,
} from "lucide-react";
import Link from "next/link";
import { WeatherWidget } from "@/components/WeatherWidget";
import { CatalogModal } from "@/components/CatalogModal";
import { useToast } from "@/components/Toast";

// ── Default inputs ────────────────────────────────────────────
const DEFAULT_INPUTS: ProjectInputs = {
  itens: [],
  overhead_pct: 15,
  contingencia_pct: 10,
  margem_alvo_pct: 30,
  margem_minima_pct: 15,
  investimento_pct: 0,
  iva_regime: "continental_23",
};

// ── Slider row ────────────────────────────────────────────────
function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  color = "var(--accent)",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  color?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: "var(--text-2)" }}>{label}</span>
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color }}
        >
          {value.toFixed(step < 1 ? 1 : 0)}%
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider"
        style={{ "--slider-color": color } as React.CSSProperties}
      />
      <div className="flex justify-between">
        <span className="text-xs" style={{ color: "var(--text-3)" }}>{min}%</span>
        <span className="text-xs" style={{ color: "var(--text-3)" }}>{max}%</span>
      </div>
    </div>
  );
}

// ── Item row ─────────────────────────────────────────────────
function ItemRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: ProjectItem;
  onUpdate: (updated: ProjectItem) => void;
  onDelete: () => void;
}) {
  const total = item.quantidade * item.preco_unitario;
  const cat = CATEGORIAS.find((c) => c.value === item.categoria);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, height: 0 }}
      transition={{ duration: 0.2 }}
      className="grid gap-2 items-center py-2 px-3 rounded-lg"
      style={{
        background: "var(--surface-2)",
        gridTemplateColumns: "auto 1fr 80px 90px 90px 80px auto",
      }}
    >
      {/* Categoria dot */}
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: cat?.color ?? "var(--text-3)" }}
        title={cat?.label}
      />

      {/* Nome */}
      <input
        value={item.nome}
        onChange={(e) => onUpdate({ ...item, nome: e.target.value })}
        className="input input-sm bg-transparent border-transparent hover:border-opacity-50 focus:border-opacity-100"
        style={{ padding: "0.25rem 0.5rem", minWidth: 0 }}
        placeholder="Nome do item"
      />

      {/* Categoria */}
      <select
        value={item.categoria}
        onChange={(e) => onUpdate({ ...item, categoria: e.target.value as Categoria })}
        className="input input-sm hidden sm:block"
        style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
      >
        {CATEGORIAS.map((c) => (
          <option key={c.value} value={c.value}>{c.label.split(" ")[0]}</option>
        ))}
      </select>

      {/* Qtd */}
      <input
        type="number"
        min={0}
        step={0.5}
        value={item.quantidade}
        onChange={(e) => onUpdate({ ...item, quantidade: parseFloat(e.target.value) || 0 })}
        className="input input-sm text-right"
        style={{ padding: "0.25rem 0.5rem" }}
        placeholder="Qtd"
      />

      {/* Preço unit */}
      <input
        type="number"
        min={0}
        step={10}
        value={item.preco_unitario}
        onChange={(e) => onUpdate({ ...item, preco_unitario: parseFloat(e.target.value) || 0 })}
        className="input input-sm text-right"
        style={{ padding: "0.25rem 0.5rem" }}
        placeholder="€/un"
      />

      {/* Total */}
      <span
        className="text-sm font-semibold text-right tabular-nums"
        style={{ color: "var(--accent-2)" }}
      >
        {fmt(total)}€
      </span>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="btn btn-ghost btn-icon-sm shrink-0"
        style={{ color: "var(--error)" }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const toast = useToast();

  const [projectName, setProjectName] = useState("Novo Projeto");
  const [clientName, setClientName] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("rascunho");
  const [inputs, setInputs] = useState<ProjectInputs>(DEFAULT_INPUTS);
  const [calc, setCalc] = useState<ProjectCalc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "parametros" | "resumo" | "brief" | "entregas">("items");
  const [expandedCat, setExpandedCat] = useState<string | null>("crew");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogCat, setCatalogCat] = useState<Categoria>("crew");
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // ── Geo state ─────────────────────────────────────────────
  const [geoData, setGeoData] = useState<{
    lat: number; lng: number; label?: string;
    travel_km?: number; travel_minutes?: number;
  } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  // ── Entregas state ────────────────────────────────────────
  interface DelivFile {
    id: string; filename: string; ext: string; file_type: string;
    collection: string; shared_link: string | null; bytes: number | null;
    captured_at: string | null; created_at: string;
  }
  const [delivFiles, setDelivFiles] = useState<DelivFile[]>([]);
  const [delivFilterType, setDelivFilterType] = useState("all");
  const [delivFilterCol, setDelivFilterCol] = useState("all");
  const [dropboxPath, setDropboxPath] = useState("");
  const [dropboxConfigured, setDropboxConfigured] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [editingDropboxPath, setEditingDropboxPath] = useState(false);
  const [savingDropboxPath, setSavingDropboxPath] = useState(false);

  // ── Load ──────────────────────────────────────────────────
  const loadProject = useCallback(async () => {
    const sb = createClient();
    const { data, error } = await sb
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error || !data) {
      router.push("/app/projects");
      return;
    }

    setProjectName(data.project_name ?? "");
    setClientName(data.client_name ?? "");
    setStatus(data.status ?? "rascunho");

    const inp = data.inputs as ProjectInputs;
    setInputs({
      ...DEFAULT_INPUTS,
      ...inp,
      itens: inp?.itens ?? [],
    });
    setCalc(data.calc as ProjectCalc);

    // Load geo data if already geocoded
    const d2 = data as Record<string, unknown>;
    if (typeof d2.location_lat === "number" && typeof d2.location_lng === "number") {
      setGeoData({
        lat: d2.location_lat as number,
        lng: d2.location_lng as number,
        travel_km: typeof d2.travel_km === "number" ? d2.travel_km as number : undefined,
        travel_minutes: typeof d2.travel_minutes === "number" ? d2.travel_minutes as number : undefined,
      });
    }

    // Load Dropbox config + files
    const sb2 = createClient();
    const [pdRes, filesRes] = await Promise.all([
      sb2.from("project_dropbox").select("root_path, last_sync_at").eq("project_id", projectId).single(),
      sb2.from("deliverable_files").select("id, filename, ext, file_type, collection, shared_link, bytes, captured_at, created_at").eq("project_id", projectId).order("captured_at", { ascending: false }),
    ]);
    if (pdRes.data) {
      setDropboxPath(pdRes.data.root_path ?? "");
      setDropboxConfigured(true);
      setLastSync(pdRes.data.last_sync_at ?? null);
    }
    setDelivFiles((filesRes.data ?? []) as DelivFile[]);

    setLoading(false);
  }, [projectId, router]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // ── Recalculate on inputs change ──────────────────────────
  useEffect(() => {
    if (loading) return;
    const newCalc = calcularOrcamento(
      inputs.itens,
      inputs.overhead_pct,
      inputs.contingencia_pct,
      inputs.margem_alvo_pct,
      inputs.margem_minima_pct,
      inputs.investimento_pct,
      inputs.iva_regime
    );
    setCalc(newCalc);
  }, [inputs, loading]);

  // ── Save ──────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!calc) return;
    setSaving(true);
    const sb = createClient();
    const { error } = await sb
      .from("projects")
      .update({
        project_name: projectName.trim() || "Sem nome",
        client_name: clientName.trim(),
        status,
        inputs,
        calc,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    setSaving(false);
    if (error) {
      toast.error(`Erro ao guardar: ${error.message}`);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [calc, projectName, clientName, status, inputs, projectId, toast]);

  // Auto-save on changes (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      handleSave();
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [inputs, projectName, clientName, status, loading, handleSave]);

  // ── Item CRUD ─────────────────────────────────────────────
  const addItem = (categoria: Categoria) => {
    const newItem: ProjectItem = {
      id: generateId(),
      categoria,
      nome: "",
      unidade: "dia",
      quantidade: 1,
      preco_unitario: 0,
      total: 0,
    };
    setInputs((prev) => ({
      ...prev,
      itens: [...prev.itens, newItem],
    }));
    setExpandedCat(categoria);
  };

  const updateItem = (id: string, updated: ProjectItem) => {
    setInputs((prev) => ({
      ...prev,
      itens: prev.itens.map((i) => (i.id === id ? updated : i)),
    }));
  };

  const deleteItem = (id: string) => {
    setInputs((prev) => ({
      ...prev,
      itens: prev.itens.filter((i) => i.id !== id),
    }));
  };

  // ── Delete project (soft delete) ──────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteProject = async () => {
    setDeleting(true);
    const sb = createClient();
    const { error } = await sb
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", projectId);
    setDeleting(false);
    if (error) {
      toast.error(`Erro ao apagar projeto: ${error.message}`);
    } else {
      toast.success("Projeto arquivado com sucesso");
      router.push("/app/projects");
    }
  };

  // ── Export PDF ────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const { generatePdf } = await import("@/lib/pdf");
      const bytes = await generatePdf({
        id: projectId,
        user_id: "",
        project_name: projectName,
        client_name: clientName,
        status,
        inputs,
        calc: calc!,
        created_at: new Date().toISOString(),
      });
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orcamento-${projectName.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao gerar PDF — tenta novamente");
    }
  };

  // ── Export CSV ────────────────────────────────────────────
  const handleExportCsv = async () => {
    if (!calc) return;
    try {
      const { generateCsv } = await import("@/lib/pdf");
      const csv = generateCsv({
        id: projectId,
        user_id: "",
        project_name: projectName,
        client_name: clientName,
        status,
        inputs,
        calc: calc!,
        created_at: new Date().toISOString(),
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orcamento-${projectName.replace(/\s+/g, "-").toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erro ao gerar CSV");
    }
  };

  // ── Export PPTX ───────────────────────────────────────────
  const [pptxLoading, setPptxLoading] = useState(false);
  const handleExportPptx = async () => {
    if (!calc || pptxLoading) return;
    setPptxLoading(true);
    try {
      const res = await fetch(`/api/export/pptx?projectId=${projectId}`);
      if (!res.ok) { toast.error("Erro ao gerar apresentação PPTX"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Erro ao gerar apresentação"); }
    finally { setPptxLoading(false); }
  };

  // ── Donut chart data ──────────────────────────────────────
  const donutData = calc
    ? CATEGORIAS.map((cat) => {
        const val =
          cat.value === "crew" ? calc.custo_crew :
          cat.value === "equipamento" ? calc.custo_equipamento :
          cat.value === "pos_producao" ? calc.custo_pos :
          cat.value === "despesas" ? calc.custo_despesas :
          calc.custo_outro;
        return { name: cat.label, value: val, color: cat.color };
      }).filter((d) => d.value > 0)
    : [];

  // ── Loading skeleton ──────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-4 w-32 rounded" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
          <div className="skeleton h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const totalItems = inputs.itens.length;
  const statusInfo = PROJECT_STATUS.find((s) => s.value === status);

  return (
    <div className="space-y-5 pb-8">
      {/* ── Top bar ── */}
      <div className="flex items-start gap-3">
        <Link href="/app/projects" className="btn btn-ghost btn-icon-sm mt-1 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                ref={nameRef}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
                className="input text-xl font-bold"
                style={{ letterSpacing: "-0.02em" }}
                autoFocus
              />
              <button
                onClick={() => setEditingName(false)}
                className="btn btn-ghost btn-icon-sm"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              className="flex items-center gap-2 group text-left"
              onClick={() => setEditingName(true)}
            >
              <h1
                className="text-xl font-bold truncate"
                style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
              >
                {projectName || "Sem nome"}
              </h1>
              <Edit2
                className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                style={{ color: "var(--text-3)" }}
              />
            </button>
          )}

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nome do cliente"
              className="text-sm bg-transparent border-none outline-none"
              style={{ color: "var(--text-2)", minWidth: "10rem" }}
            />
            <span style={{ color: "var(--border-3)" }}>·</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className={`badge ${statusInfo?.badge ?? "badge-default"} cursor-pointer border-none bg-transparent text-xs`}
              style={{ appearance: "none", WebkitAppearance: "none", padding: "0.125rem 0.625rem" }}
            >
              {PROJECT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <AnimatePresence>
            {saved && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs flex items-center gap-1"
                style={{ color: "var(--success)" }}
              >
                <Check className="h-3.5 w-3.5" />
                Guardado
              </motion.span>
            )}
          </AnimatePresence>
          <button
            onClick={handleExportCsv}
            className="btn btn-ghost btn-sm"
            title="Exportar CSV"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            onClick={handleExportPptx}
            disabled={pptxLoading || !calc}
            className="btn btn-ghost btn-sm"
            title="Gerar Apresentação (.pptx)"
          >
            {pptxLoading ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : (
              <Presentation className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{pptxLoading ? "…" : "Slides"}</span>
          </button>
          <button
            onClick={handleExport}
            className="btn btn-secondary btn-sm"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary btn-sm"
          >
            <Save className="h-4 w-4" />
            {saving ? "…" : <span className="hidden sm:inline">Guardar</span>}
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="btn btn-ghost btn-icon-sm"
            title="Arquivar projeto"
            style={{ color: "var(--error)" }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 12, opacity: 0 }}
              className="card w-full max-w-sm space-y-4"
              style={{ border: "1px solid var(--error-border)", background: "var(--surface)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "var(--error-bg)" }}
                >
                  <Trash2 className="h-5 w-5" style={{ color: "var(--error)" }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: "var(--text)" }}>Arquivar Projeto</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>Esta ação é reversível</p>
                </div>
              </div>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                O projeto <strong style={{ color: "var(--text)" }}>"{projectName}"</strong> será arquivado e removido da lista principal. Podes recuperá-lo mais tarde.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteProject}
                  disabled={deleting}
                  className="btn btn-sm flex-1"
                  style={{ background: "var(--error)", color: "white", borderRadius: "var(--r-full)" }}
                >
                  {deleting ? "A arquivar…" : "Arquivar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tabs ── */}
      <div className="tabs-list">
        {(["items", "parametros", "resumo", "brief", "entregas"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`tab-trigger ${activeTab === tab ? "active" : ""}`}
          >
            {tab === "items" && `Items (${totalItems})`}
            {tab === "parametros" && "Parâmetros"}
            {tab === "resumo" && "Resumo"}
            {tab === "brief" && "Brief"}
            {tab === "entregas" && "Entregas"}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        {activeTab === "items" && (
          <motion.div
            key="items"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {CATEGORIAS.map((cat) => {
              const catItems = inputs.itens.filter((i) => i.categoria === cat.value);
              const catTotal = catItems.reduce(
                (s, i) => s + i.quantidade * i.preco_unitario, 0
              );
              const isOpen = expandedCat === cat.value;

              return (
                <div key={cat.value} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {/* Cat header */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
                    style={{ background: "var(--surface)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface)")}
                    onClick={() => setExpandedCat(isOpen ? null : cat.value)}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: cat.color }}
                    />
                    <span className="text-sm font-medium flex-1 text-left" style={{ color: "var(--text)" }}>
                      {cat.label}
                    </span>
                    {catItems.length > 0 && (
                      <span className="badge badge-default text-xs">
                        {catItems.length}
                      </span>
                    )}
                    {catTotal > 0 && (
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: cat.color }}
                      >
                        {fmtEur(catTotal)}
                      </span>
                    )}
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0" style={{ color: "var(--text-3)" }} />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--text-3)" }} />
                    )}
                  </button>

                  {/* Cat items */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: "hidden" }}
                      >
                        <div
                          className="px-3 pb-3 space-y-1.5"
                          style={{ borderTop: "1px solid var(--border)" }}
                        >
                          {/* Column headers */}
                          {catItems.length > 0 && (
                            <div
                              className="grid gap-2 px-3 pt-2 pb-1 text-xs"
                              style={{
                                color: "var(--text-3)",
                                gridTemplateColumns: "auto 1fr 80px 90px 90px 80px auto",
                              }}
                            >
                              <span />
                              <span>Nome</span>
                              <span className="hidden sm:block">Cat.</span>
                              <span className="text-right">Qtd</span>
                              <span className="text-right">€/un</span>
                              <span className="text-right">Total</span>
                              <span />
                            </div>
                          )}

                          <AnimatePresence>
                            {catItems.map((item) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                onUpdate={(updated) => updateItem(item.id, updated)}
                                onDelete={() => deleteItem(item.id)}
                              />
                            ))}
                          </AnimatePresence>

                          <button
                            onClick={() => { setCatalogCat(cat.value as Categoria); setCatalogOpen(true); }}
                            className="btn btn-ghost btn-sm w-full mt-1"
                            style={{ color: cat.color, justifyContent: "flex-start" }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Adicionar {cat.label.split(" ")[0]}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </motion.div>
        )}

        {activeTab === "parametros" && (
          <motion.div
            key="parametros"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="grid gap-4 lg:grid-cols-2"
          >
            {/* IVA */}
            <div className="card space-y-4">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Regime de IVA
              </h3>
              <div className="grid gap-2">
                {IVA_REGIMES.map((regime) => (
                  <button
                    key={regime.value}
                    onClick={() => setInputs((prev) => ({ ...prev, iva_regime: regime.value as IvaRegime }))}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all text-left"
                    style={{
                      background: inputs.iva_regime === regime.value
                        ? "var(--accent-dim)"
                        : "var(--surface-2)",
                      border: `1px solid ${inputs.iva_regime === regime.value ? "rgba(26,143,163,0.3)" : "var(--border)"}`,
                    }}
                  >
                    <span
                      className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                      style={{
                        borderColor: inputs.iva_regime === regime.value ? "var(--accent)" : "var(--border-3)",
                        background: inputs.iva_regime === regime.value ? "var(--accent)" : "transparent",
                      }}
                    >
                      {inputs.iva_regime === regime.value && (
                        <Check className="h-2.5 w-2.5 text-white" />
                      )}
                    </span>
                    <span className="flex-1 text-sm" style={{ color: "var(--text)" }}>
                      {regime.label}
                    </span>
                    <span className="badge badge-accent text-xs">
                      {regime.rate}%
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Margens e custos */}
            <div className="card space-y-5">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Margens e Custos
              </h3>
              <SliderRow
                label="Overhead"
                value={inputs.overhead_pct}
                min={0}
                max={50}
                onChange={(v) => setInputs((p) => ({ ...p, overhead_pct: v }))}
                color="var(--accent)"
              />
              <SliderRow
                label="Contingência"
                value={inputs.contingencia_pct}
                min={0}
                max={30}
                onChange={(v) => setInputs((p) => ({ ...p, contingencia_pct: v }))}
                color="#d97706"
              />
              <SliderRow
                label="Margem Alvo"
                value={inputs.margem_alvo_pct}
                min={0}
                max={60}
                onChange={(v) => setInputs((p) => ({ ...p, margem_alvo_pct: v }))}
                color="#34d399"
              />
              <SliderRow
                label="Margem Mínima"
                value={inputs.margem_minima_pct}
                min={0}
                max={40}
                onChange={(v) => setInputs((p) => ({ ...p, margem_minima_pct: v }))}
                color="#7c3aed"
              />
              <SliderRow
                label="Investimento"
                value={inputs.investimento_pct}
                min={0}
                max={20}
                onChange={(v) => setInputs((p) => ({ ...p, investimento_pct: v }))}
                color="#f87171"
              />
            </div>
          </motion.div>
        )}

        {activeTab === "resumo" && calc && (
          <motion.div
            key="resumo"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            {/* Price highlight */}
            <div
              className="card-accent rounded-2xl p-6 text-center space-y-1"
              style={{ background: "linear-gradient(135deg, var(--surface) 0%, var(--surface-3) 100%)" }}
            >
              <p className="section-title">Preço Recomendado</p>
              <motion.p
                key={calc.preco_recomendado}
                initial={{ scale: 0.95, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-4xl font-bold"
                style={{ color: "var(--accent-2)", letterSpacing: "-0.04em" }}
              >
                {fmtEur(calc.preco_recomendado)}
              </motion.p>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                c/ IVA: <strong style={{ color: "var(--text)" }}>{fmtEur(calc.preco_recomendado_com_iva)}</strong>
                {" · "}
                Margem: <strong style={{ color: "#34d399" }}>{inputs.margem_alvo_pct}%</strong>
              </p>
              <div
                className="mt-3 pt-3 flex items-center justify-center gap-6"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <div className="text-center">
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>Preço Mínimo</p>
                  <p className="text-base font-bold" style={{ color: "var(--text-2)" }}>
                    {fmtEur(calc.preco_minimo)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>
                    c/ IVA {fmtEur(calc.preco_minimo_com_iva)}
                  </p>
                </div>
                <div
                  className="h-10"
                  style={{ width: "1px", background: "var(--border-2)" }}
                />
                <div className="text-center">
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>IVA ({inputs.iva_regime === "isento" ? "0" : IVA_REGIMES.find(r => r.value === inputs.iva_regime)?.rate}%)</p>
                  <p className="text-base font-bold" style={{ color: "var(--text-2)" }}>
                    {fmtEur(calc.iva_valor)}
                  </p>
                </div>
              </div>
            </div>

            {/* Grid: donut + breakdown */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Donut chart */}
              {donutData.length > 0 && (
                <div className="card space-y-4">
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                    Distribuição de Custos
                  </p>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {donutData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} strokeWidth={0} />
                          ))}
                        </Pie>
                        <Tooltip
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(v: any) => [fmtEur(Number(v ?? 0)), ""]}
                          contentStyle={{
                            background: "var(--surface-3)",
                            border: "1px solid var(--border-2)",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            color: "var(--text)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1.5">
                    {donutData.map((d) => (
                      <div key={d.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: d.color }}
                          />
                          <span className="text-xs" style={{ color: "var(--text-2)" }}>{d.name}</span>
                        </div>
                        <span className="text-xs font-medium tabular-nums" style={{ color: "var(--text)" }}>
                          {fmtEur(d.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Breakdown */}
              <div className="card space-y-2">
                <p className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>
                  Breakdown Financeiro
                </p>
                {[
                  { label: "Custo Direto", value: calc.custo_direto, color: "var(--text)" },
                  { label: `Overhead (${inputs.overhead_pct}%)`, value: calc.overhead_valor, color: "var(--accent-2)" },
                  { label: `Contingência (${inputs.contingencia_pct}%)`, value: calc.contingencia_valor, color: "#d97706" },
                  ...(calc.investimento_valor > 0 ? [{ label: `Investimento (${inputs.investimento_pct}%)`, value: calc.investimento_valor, color: "#f87171" }] : []),
                  { label: "Subtotal s/ IVA", value: calc.subtotal_pre_iva, color: "var(--text)", bold: true },
                  { label: `Margem Alvo (${inputs.margem_alvo_pct}%)`, value: calc.margem_alvo_valor, color: "#34d399" },
                ].map(({ label, value, color, bold }) => (
                  <div key={label} className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-sm" style={{ color: bold ? "var(--text)" : "var(--text-2)", fontWeight: bold ? 600 : 400 }}>
                      {label}
                    </span>
                    <span
                      className="text-sm tabular-nums"
                      style={{ color, fontWeight: bold ? 700 : 500 }}
                    >
                      {fmtEur(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Commercial terms generator */}
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  Condições Comerciais
                </p>
                <button
                  onClick={() => {
                    const price = calc?.preco_recomendado_com_iva ?? calc?.preco_recomendado ?? 0;
                    const sinal = Math.round(price * 0.5 * 100) / 100;
                    const restante = Math.round((price - sinal) * 100) / 100;
                    const terms = `Proposta válida por 30 dias. Pagamento: 50% de sinal (${fmtEur(sinal)}) na adjudicação + 50% (${fmtEur(restante)}) na entrega. Prazo de pagamento: 30 dias. Revisões incluídas: 2 rondas. Propriedade intelectual transferida após pagamento integral.`;
                    setInputs((p) => ({ ...p, condicoes: terms }));
                  }}
                  className="btn btn-ghost btn-sm text-xs"
                  style={{ color: "var(--accent-2)" }}
                >
                  Gerar automaticamente
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Observações Internas</label>
                  <textarea
                    value={inputs.observacoes ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, observacoes: e.target.value }))}
                    className="input"
                    rows={3}
                    placeholder="Notas internas, pontos de atenção…"
                    style={{ resize: "none" }}
                  />
                </div>
                <div>
                  <label className="label">Termos e Condições (PDF)</label>
                  <textarea
                    value={inputs.condicoes ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, condicoes: e.target.value }))}
                    className="input"
                    rows={3}
                    placeholder="Clica em 'Gerar automaticamente' ou escreve aqui…"
                    style={{ resize: "none" }}
                  />
                </div>
              </div>
              {/* Quick presets */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "50/50", desc: "50% sinal + 50% entrega" },
                  { label: "30/70", desc: "30% sinal + 70% entrega" },
                  { label: "Faseado", desc: "33% início + 33% rodagem + 34% entrega" },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      const price = calc?.preco_recomendado_com_iva ?? calc?.preco_recomendado ?? 0;
                      let terms = "";
                      if (preset.label === "50/50") {
                        const s = Math.round(price * 0.5 * 100) / 100;
                        terms = `Pagamento em 2 prestações: 50% de sinal (${fmtEur(s)}) + 50% na entrega. Válido 30 dias.`;
                      } else if (preset.label === "30/70") {
                        const s = Math.round(price * 0.3 * 100) / 100;
                        terms = `Pagamento em 2 prestações: 30% de sinal (${fmtEur(s)}) + 70% na entrega. Válido 30 dias.`;
                      } else {
                        const s = Math.round(price * 0.33 * 100) / 100;
                        terms = `Pagamento faseado: 1/3 início (${fmtEur(s)}) + 1/3 durante rodagem + 1/3 entrega. Válido 30 dias.`;
                      }
                      setInputs((p) => ({ ...p, condicoes: terms }));
                    }}
                    className="btn btn-ghost btn-sm text-xs"
                    style={{ fontSize: "0.7rem", padding: "0.25rem 0.6rem" }}
                  >
                    {preset.label}
                    <span className="ml-1 hidden sm:inline" style={{ color: "var(--text-3)" }}>
                      — {preset.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "brief" && (
          <motion.div
            key="brief"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            {/* Brief – Production questionnaire */}
            <div className="card space-y-4">
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Briefing de Produção
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Tipo de Projeto</label>
                  <select
                    value={inputs.descricao?.split("|")[0] ?? ""}
                    onChange={(e) => {
                      const parts = (inputs.descricao ?? "").split("|");
                      parts[0] = e.target.value;
                      setInputs((p) => ({ ...p, descricao: parts.join("|") }));
                    }}
                    className="input"
                  >
                    <option value="">Selecionar tipo…</option>
                    <option value="institucional">Vídeo Institucional</option>
                    <option value="shortform">Conteúdo Short-Form</option>
                    <option value="documentary">Documentário</option>
                    <option value="event">Captação de Evento</option>
                    <option value="commercial">Anúncio Publicitário</option>
                    <option value="social">Social Media</option>
                    <option value="interview">Entrevista</option>
                    <option value="training">Vídeo de Formação</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="label">Data de Entrega</label>
                  <input
                    type="date"
                    value={inputs.data_projeto ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, data_projeto: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Data Início de Rodagem</label>
                  <input
                    type="date"
                    value={(inputs as unknown as Record<string, unknown>).shoot_date_start as string ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, shoot_date_start: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Data Fim de Rodagem</label>
                  <input
                    type="date"
                    value={(inputs as unknown as Record<string, unknown>).shoot_date_end as string ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, shoot_date_end: e.target.value }))}
                    className="input"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Cidade / Local de Rodagem</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inputs.cidade ?? ""}
                      onChange={(e) => {
                        setInputs((p) => ({ ...p, cidade: e.target.value }));
                        setGeoData(null);
                      }}
                      className="input flex-1"
                      placeholder="Ex: Lisboa, Porto, Setúbal…"
                    />
                    <button
                      type="button"
                      disabled={geocoding || !inputs.cidade?.trim()}
                      onClick={async () => {
                        if (!inputs.cidade?.trim()) return;
                        setGeocoding(true);
                        try {
                          const gRes = await fetch(`/api/geo/geocode?q=${encodeURIComponent(inputs.cidade!)}`);
                          const gJson = await gRes.json() as { lat: number; lng: number; label?: string } | null;
                          if (!gJson) { toast.error("Local não encontrado — tenta uma cidade mais específica"); setGeocoding(false); return; }

                          const rRes = await fetch(`/api/geo/route?lat=${gJson.lat}&lng=${gJson.lng}`);
                          const rJson = await rRes.json() as { travel_km: number; travel_minutes: number };

                          const newGeo = { ...gJson, travel_km: rJson.travel_km, travel_minutes: rJson.travel_minutes };
                          setGeoData(newGeo);

                          // Save lat/lng/travel to project directly
                          const { createClient: mkClient } = await import("@/lib/supabase");
                          const sb = mkClient();
                          await sb.from("projects").update({
                            location_text: inputs.cidade,
                            location_lat: newGeo.lat,
                            location_lng: newGeo.lng,
                            travel_km: newGeo.travel_km,
                            travel_minutes: newGeo.travel_minutes,
                          }).eq("id", projectId);
                        } catch {
                          toast.error("Erro ao geocodificar — verifica a ligação");
                        }
                        setGeocoding(false);
                      }}
                      className="btn btn-secondary btn-sm shrink-0"
                    >
                      {geocoding ? (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      ) : (
                        <span>📍 Localizar</span>
                      )}
                    </button>
                  </div>

                  {/* Travel info */}
                  {geoData && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      <div
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
                      >
                        <span>🚗</span>
                        <span className="font-semibold" style={{ color: "var(--text)" }}>
                          {geoData.travel_km} km
                        </span>
                        <span style={{ color: "var(--border-3)" }}>·</span>
                        <span>desde Setúbal</span>
                      </div>
                      <div
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                        style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
                      >
                        <span>⏱</span>
                        <span className="font-semibold" style={{ color: "var(--text)" }}>
                          {geoData.travel_minutes} min
                        </span>
                        <span>de viagem</span>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">País</label>
                  <input
                    type="text"
                    value={inputs.pais ?? "Portugal"}
                    onChange={(e) => setInputs((p) => ({ ...p, pais: e.target.value }))}
                    className="input"
                    placeholder="Portugal"
                  />
                </div>
                <div>
                  <label className="label">Localidade / Zona</label>
                  <input
                    type="text"
                    value={inputs.localidade ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, localidade: e.target.value }))}
                    className="input"
                    placeholder="Ex: Chiado, Parque das Nações…"
                  />
                </div>
              </div>
            </div>

            {/* Weather section */}
            {geoData && (
              <div className="card space-y-4">
                <WeatherWidget
                  lat={geoData.lat}
                  lng={geoData.lng}
                  projectId={projectId}
                  startDate={(inputs as unknown as Record<string, unknown>).shoot_date_start as string | undefined}
                  endDate={(inputs as unknown as Record<string, unknown>).shoot_date_end as string | undefined}
                />
              </div>
            )}

            {/* Client brief */}
            <div className="card space-y-4">
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Brief do Cliente
              </p>
              <div>
                <label className="label">Descrição do Projeto</label>
                <textarea
                  value={inputs.descricao ?? ""}
                  onChange={(e) => setInputs((p) => ({ ...p, descricao: e.target.value }))}
                  className="input"
                  rows={4}
                  placeholder="Descreve o projeto, objetivos, público-alvo, referências visuais…"
                  style={{ resize: "none" }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Observações Internas</label>
                  <textarea
                    value={inputs.observacoes ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, observacoes: e.target.value }))}
                    className="input"
                    rows={3}
                    placeholder="Notas internas, pontos de atenção…"
                    style={{ resize: "none" }}
                  />
                </div>
                <div>
                  <label className="label">Condições Comerciais</label>
                  <textarea
                    value={inputs.condicoes ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, condicoes: e.target.value }))}
                    className="input"
                    rows={3}
                    placeholder="Termos de pagamento, prazo de revisões…"
                    style={{ resize: "none" }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "entregas" && (
          <motion.div
            key="entregas"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            {/* Dropbox config */}
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" style={{ color: "var(--text-3)" }} />
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Configuração Dropbox</p>
                </div>
                {lastSync && (
                  <span className="text-xs" style={{ color: "var(--text-3)" }}>
                    Sync: {new Date(lastSync).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>

              {editingDropboxPath || !dropboxConfigured ? (
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    value={dropboxPath}
                    onChange={(e) => setDropboxPath(e.target.value)}
                    placeholder="/Beyond/Clients/NomeCliente/NomeProjeto"
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={savingDropboxPath || !dropboxPath.trim()}
                    onClick={async () => {
                      setSavingDropboxPath(true);
                      const sb = createClient();
                      await sb.from("project_dropbox").upsert(
                        { project_id: projectId, root_path: dropboxPath.trim() },
                        { onConflict: "project_id" }
                      );
                      setDropboxConfigured(true);
                      setEditingDropboxPath(false);
                      setSavingDropboxPath(false);
                    }}
                  >
                    {savingDropboxPath ? "…" : "Guardar"}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <FolderOpen className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                  <span className="text-sm flex-1 truncate font-mono" style={{ color: "var(--text-2)" }}>{dropboxPath}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingDropboxPath(true)}>
                    Editar
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={syncing}
                    onClick={async () => {
                      setSyncing(true);
                      try {
                        const res = await fetch(`/api/dropbox/sync?projectId=${projectId}`, { method: "POST" });
                        const json = await res.json() as { synced?: number; new?: number };
                        if (json.synced !== undefined) {
                          setLastSync(new Date().toISOString());
                          // Reload files
                          const sb = createClient();
                          const { data } = await sb.from("deliverable_files").select("id, filename, ext, file_type, collection, shared_link, bytes, captured_at, created_at").eq("project_id", projectId).order("captured_at", { ascending: false });
                          setDelivFiles((data ?? []) as DelivFile[]);
                        }
                      } catch { /* ignore */ }
                      setSyncing(false);
                    }}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                    {syncing ? "A sincronizar…" : "Sincronizar agora"}
                  </button>
                </div>
              )}
            </div>

            {/* Files */}
            {delivFiles.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <Package className="empty-icon" />
                  <p className="empty-title">Sem entregas</p>
                  <p className="empty-desc">Configura o caminho Dropbox e sincroniza para ver os ficheiros.</p>
                </div>
              </div>
            ) : (() => {
              const FILE_TYPE_CFG: Record<string, { icon: typeof Film; color: string; label: string }> = {
                photo:    { icon: Image,    color: "#1a8fa3", label: "Fotos" },
                video:    { icon: Film,     color: "#7c3aed", label: "Vídeos" },
                document: { icon: FileText, color: "#d97706", label: "Docs" },
                audio:    { icon: Music,    color: "#34a853", label: "Áudio" },
                other:    { icon: Package,  color: "#5a6280", label: "Outros" },
              };
              const fileTypes = ["all", ...Array.from(new Set(delivFiles.map((f) => f.file_type)))];
              const collections = ["all", ...Array.from(new Set(delivFiles.map((f) => f.collection ?? "Geral")))];
              const visible = delivFiles.filter((f) => {
                const t = delivFilterType === "all" || f.file_type === delivFilterType;
                const c = delivFilterCol === "all" || (f.collection ?? "Geral") === delivFilterCol;
                return t && c;
              });
              const grouped = visible.reduce<Record<string, typeof visible>>((acc, f) => {
                const col = f.collection ?? "Geral";
                (acc[col] ??= []).push(f);
                return acc;
              }, {});

              return (
                <div className="space-y-4">
                  {/* Filter bar */}
                  <div className="flex flex-wrap gap-2">
                    <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--surface-2)" }}>
                      {fileTypes.map((t) => {
                        const cfg = FILE_TYPE_CFG[t as keyof typeof FILE_TYPE_CFG];
                        return (
                          <button key={t} onClick={() => setDelivFilterType(t)}
                            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                            style={{ background: delivFilterType === t ? "var(--surface-3)" : "transparent", color: delivFilterType === t ? "var(--text)" : "var(--text-3)" }}>
                            {t === "all" ? "Todos" : (cfg?.label ?? t)}
                          </button>
                        );
                      })}
                    </div>
                    {collections.length > 2 && (
                      <div className="flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: "var(--surface-2)" }}>
                        {collections.map((c) => (
                          <button key={c} onClick={() => setDelivFilterCol(c)}
                            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                            style={{ background: delivFilterCol === c ? "var(--surface-3)" : "transparent", color: delivFilterCol === c ? "var(--text)" : "var(--text-3)" }}>
                            {c === "all" ? "Todas" : c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* File groups */}
                  {Object.entries(grouped).map(([col, colFiles]) => (
                    <div key={col} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{col}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {colFiles.map((f) => {
                          const cfg = FILE_TYPE_CFG[f.file_type as keyof typeof FILE_TYPE_CFG] ?? FILE_TYPE_CFG.other;
                          const Icon = cfg.icon;
                          return (
                            <div key={f.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
                              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cfg.color}20` }}>
                                <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>{f.filename}</p>
                                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                                  {f.ext?.toUpperCase()}{f.bytes ? ` · ${f.bytes > 1048576 ? `${(f.bytes / 1048576).toFixed(1)} MB` : `${(f.bytes / 1024).toFixed(0)} KB`}` : ""}
                                </p>
                              </div>
                              {f.shared_link && (
                                <a href={f.shared_link} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating summary bar ── */}
      {calc && calc.custo_direto > 0 && activeTab === "items" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 hidden md:flex"
          style={{
            maxWidth: "calc(100% - 2rem)",
            width: "auto",
          }}
        >
          <div
            className="flex items-center gap-6 rounded-2xl px-6 py-3"
            style={{
              background: "var(--glass-bg)",
              backdropFilter: "var(--glass-blur)",
              WebkitBackdropFilter: "var(--glass-blur)",
              border: "1px solid var(--border-2)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div className="text-center">
              <p className="text-xs" style={{ color: "var(--text-3)" }}>Custo Direto</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: "var(--text)" }}>
                {fmtEur(calc.custo_direto)}
              </p>
            </div>
            <span style={{ color: "var(--border-3)" }}>→</span>
            <div className="text-center">
              <p className="text-xs" style={{ color: "var(--text-3)" }}>Recomendado</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: "var(--accent-2)" }}>
                {fmtEur(calc.preco_recomendado)}
              </p>
            </div>
            <span style={{ color: "var(--border-3)" }}>|</span>
            <div className="text-center">
              <p className="text-xs" style={{ color: "var(--text-3)" }}>c/ IVA</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: "var(--text)" }}>
                {fmtEur(calc.preco_recomendado_com_iva)}
              </p>
            </div>
            <button
              onClick={() => setActiveTab("resumo")}
              className="btn btn-primary btn-sm ml-2"
            >
              Ver Resumo
            </button>
          </div>
        </motion.div>
      )}

      {/* Mobile bottom summary */}
      {calc && calc.custo_direto > 0 && activeTab === "items" && (
        <div
          className="fixed bottom-[72px] left-0 right-0 md:hidden px-4 pb-2"
          style={{ zIndex: 30 }}
        >
          <div
            className="rounded-xl px-4 py-2 flex items-center justify-between"
            style={{
              background: "var(--glass-bg)",
              backdropFilter: "var(--glass-blur)",
              WebkitBackdropFilter: "var(--glass-blur)",
              border: "1px solid var(--border-2)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>Recomendado</p>
              <p className="text-base font-bold tabular-nums" style={{ color: "var(--accent-2)" }}>
                {fmtEur(calc.preco_recomendado)}
              </p>
            </div>
            <button onClick={() => setActiveTab("resumo")} className="btn btn-primary btn-sm">
              Resumo
            </button>
          </div>
        </div>
      )}

      {/* Catalog modal */}
      <CatalogModal
        open={catalogOpen}
        defaultCategoria={catalogCat}
        onClose={() => setCatalogOpen(false)}
        onSelect={(item) => {
          setInputs((prev) => ({ ...prev, itens: [...prev.itens, item] }));
          setExpandedCat(item.categoria);
        }}
      />
    </div>
  );
}
