"use client";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { formatDateShort, generateId } from "@/lib/utils";
import { Plus, FileText, X, Check, ChevronRight, Package } from "lucide-react";
import { useToast } from "@/components/Toast";

interface TemplateRow {
  id: string;
  name: string;
  type: string;
  defaults: Record<string, unknown>;
  created_at: string;
  user_id: string | null;
  _itemCount?: number;
}

interface TemplateItem {
  id: string;
  categoria: string;
  nome: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
  ordem: number;
}

const TYPE_LABELS: Record<string, string> = {
  institutional: "Institucional",
  shortform: "Short-Form",
  documentary: "Documentário",
  event: "Evento",
  custom: "Personalizado",
};

const TYPE_COLORS: Record<string, string> = {
  institutional: "#1a8fa3",
  shortform: "#7c3aed",
  documentary: "#d97706",
  event: "#34d399",
  custom: "#5a6280",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const sb = createClient();
    const { data, error } = await sb
      .from("templates")
      .select("id, name, type, defaults, created_at, user_id")
      .order("created_at", { ascending: true });

    if (error) {
      toast.error(`Erro ao carregar templates: ${error.message}`);
      setErrorMsg(error.message);
    } else if (data) {
      // Get item counts
      const ids = data.map((t) => t.id);
      const counts = await Promise.all(
        ids.map((tid) =>
          sb.from("template_items").select("id", { count: "exact", head: true }).eq("template_id", tid)
        )
      );
      const withCounts = data.map((t, i) => ({
        ...t,
        _itemCount: counts[i].count ?? 0,
      }));
      setTemplates(withCounts as TemplateRow[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openTemplate = async (t: TemplateRow) => {
    setSelected(t);
    setLoadingItems(true);
    const sb = createClient();
    const { data } = await sb
      .from("template_items")
      .select("*")
      .eq("template_id", t.id)
      .order("ordem", { ascending: true });
    setTemplateItems((data ?? []) as TemplateItem[]);
    setLoadingItems(false);
  };

  const applyTemplate = async (t: TemplateRow) => {
    const sb = createClient();
    const { data: user } = await sb.auth.getUser();
    if (!user.user) return;

    // Create a new project with this template's defaults
    const defaults = t.defaults as Record<string, number>;
    const { data: proj, error } = await sb
      .from("projects")
      .insert({
        user_id: user.user.id,
        owner_user_id: user.user.id,  // triggers auto project_member(owner)
        project_name: `${t.name} — Projeto`,
        client_name: "",
        status: "draft",
        inputs: {
          itens: templateItems.map((item) => ({
            id: generateId(),
            categoria: item.categoria,
            nome: item.nome,
            unidade: item.unidade,
            quantidade: item.quantidade,
            preco_unitario: item.preco_unitario,
            total: item.quantidade * item.preco_unitario,
          })),
          overhead_pct: defaults.overhead_pct ?? 15,
          contingencia_pct: defaults.contingencia_pct ?? 10,
          margem_alvo_pct: defaults.margem_alvo_pct ?? 30,
          margem_minima_pct: defaults.margem_minima_pct ?? 15,
          investimento_pct: 0,
          iva_regime: "continental_23",
        },
      })
      .select()
      .single();

    if (error) {
      toast.error(`Erro ao criar projeto: ${error.message}`);
      return;
    }
    if (proj) {
      toast.success("Projeto criado a partir do template!");
      setSuccessId(t.id);
      setTimeout(() => {
        window.location.href = `/app/projects/${proj.id}`;
      }, 800);
    }
  };

  const color = (t: TemplateRow) => TYPE_COLORS[t.type] ?? "#5a6280";

  // ── Presets vs custom ─────────────────────────────────────
  const presets = templates.filter((t) => t.user_id === null);
  const custom = templates.filter((t) => t.user_id !== null);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Estruturas reutilizáveis de itens e orçamentos</p>
        </div>
        <button className="btn btn-secondary" disabled>
          <Plus className="h-4 w-4" />
          Novo Template
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card space-y-3">
              <div className="skeleton h-10 w-10 rounded-lg" />
              <div className="skeleton h-5 w-32" />
              <div className="skeleton h-4 w-24" />
            </div>
          ))}
        </div>
      ) : errorMsg ? (
        <div className="card">
          <div className="empty-state">
            <FileText className="empty-icon" />
            <p className="empty-title">Erro ao carregar templates</p>
            <p className="empty-desc">{errorMsg}</p>
            <button className="btn btn-secondary btn-sm" onClick={load}>Tentar novamente</button>
          </div>
        </div>
      ) : (
        <>
          {/* Presets */}
          {presets.length > 0 && (
            <section className="space-y-3">
              <p className="section-title">Presets de sistema</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
                {presets.map((t, i) => (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <button
                      onClick={() => openTemplate(t)}
                      className="card card-hover w-full text-left group relative"
                    >
                      {successId === t.id && (
                        <div className="absolute inset-0 rounded-xl flex items-center justify-center z-10"
                          style={{ background: "rgba(8,11,16,0.85)" }}>
                          <Check className="h-8 w-8" style={{ color: "#34d399" }} />
                        </div>
                      )}
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg mb-3"
                        style={{ background: `${color(t)}20` }}
                      >
                        <FileText className="h-5 w-5" style={{ color: color(t) }} />
                      </div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t.name}</p>
                      <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--text-3)" }}>
                        <Package className="h-3 w-3" />
                        {t._itemCount} itens
                        <span className="ml-auto flex items-center gap-0.5" style={{ color: color(t) }}>
                          {TYPE_LABELS[t.type] ?? t.type}
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      </p>
                    </button>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Custom templates */}
          {custom.length > 0 && (
            <section className="space-y-3">
              <p className="section-title">Os meus templates</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {custom.map((t, i) => (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <button
                      onClick={() => openTemplate(t)}
                      className="card card-hover w-full text-left"
                    >
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg mb-3"
                        style={{ background: `${color(t)}20` }}
                      >
                        <FileText className="h-5 w-5" style={{ color: color(t) }} />
                      </div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t.name}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                        {TYPE_LABELS[t.type] ?? t.type} · {formatDateShort(t.created_at)}
                      </p>
                    </button>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {presets.length === 0 && custom.length === 0 && (
            <div className="card">
              <div className="empty-state">
                <FileText className="empty-icon" />
                <p className="empty-title">Sem templates</p>
                <p className="empty-desc">Os presets de sistema estarão disponíveis após aplicar as migrações SQL</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Template detail modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              className="card-glass"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "560px",
                maxHeight: "80vh",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Modal header */}
              <div className="flex items-center gap-3 p-5 border-b" style={{ borderColor: "var(--border)" }}>
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${color(selected)}20` }}
                >
                  <FileText className="h-5 w-5" style={{ color: color(selected) }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold truncate" style={{ color: "var(--text)" }}>
                    {selected.name}
                  </h2>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>
                    {TYPE_LABELS[selected.type]} · {selected._itemCount} itens
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                  style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Items list */}
              <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {loadingItems ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="skeleton h-10 w-full rounded-lg" />
                  ))
                ) : templateItems.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: "var(--text-3)" }}>
                    Sem itens neste template
                  </p>
                ) : (
                  templateItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{
                          background:
                            item.categoria === "crew" ? "#1a8fa3"
                            : item.categoria === "equipamento" ? "#8b6b56"
                            : item.categoria === "pos_producao" ? "#7c3aed"
                            : item.categoria === "despesas" ? "#d97706"
                            : "#5a6280",
                        }}
                      />
                      <span className="flex-1 text-sm" style={{ color: "var(--text)" }}>
                        {item.nome}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-3)" }}>
                        {item.quantidade} {item.unidade}
                      </span>
                    </div>
                  ))
                )}

                {/* Defaults preview */}
                {Object.keys(selected.defaults).length > 0 && (
                  <div
                    className="rounded-lg p-3 mt-3 space-y-1.5"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  >
                    <p className="text-xs font-medium" style={{ color: "var(--text-3)" }}>
                      Parâmetros por omissão
                    </p>
                    {Object.entries(selected.defaults).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between text-xs">
                        <span style={{ color: "var(--text-3)" }}>
                          {key.replace(/_pct$/, "").replace(/_/g, " ")}
                        </span>
                        <span style={{ color: "var(--accent-2)" }}>
                          {typeof val === "number" ? `${val}%` : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CTA */}
              <div className="p-5 border-t" style={{ borderColor: "var(--border)" }}>
                <button
                  onClick={() => applyTemplate(selected)}
                  disabled={loadingItems || successId === selected.id}
                  className="btn btn-primary w-full"
                >
                  {successId === selected.id ? (
                    <>
                      <Check className="h-4 w-4" />
                      Projeto criado! A redirecionar…
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Usar template — Criar novo projeto
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
