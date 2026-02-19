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
} from "lucide-react";
import Link from "next/link";

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

  const [projectName, setProjectName] = useState("Novo Projeto");
  const [clientName, setClientName] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("rascunho");
  const [inputs, setInputs] = useState<ProjectInputs>(DEFAULT_INPUTS);
  const [calc, setCalc] = useState<ProjectCalc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "parametros" | "resumo">("items");
  const [expandedCat, setExpandedCat] = useState<string | null>("crew");
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

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
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [calc, projectName, clientName, status, inputs, projectId]);

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
      alert("Erro ao gerar PDF");
    }
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
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="tabs-list">
        {(["items", "parametros", "resumo"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`tab-trigger ${activeTab === tab ? "active" : ""}`}
          >
            {tab === "items" && `Items (${totalItems})`}
            {tab === "parametros" && "Parâmetros"}
            {tab === "resumo" && "Resumo"}
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
                            onClick={() => addItem(cat.value as Categoria)}
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

            {/* Notes */}
            <div className="card space-y-3">
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Notas do Projeto
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Observações</label>
                  <textarea
                    value={inputs.observacoes ?? ""}
                    onChange={(e) => setInputs((p) => ({ ...p, observacoes: e.target.value }))}
                    className="input"
                    rows={3}
                    placeholder="Observações internas…"
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
                    placeholder="Termos e condições…"
                    style={{ resize: "none" }}
                  />
                </div>
              </div>
            </div>
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
    </div>
  );
}
