// ============================================================
// Beyond Pricing — Tipos TypeScript alinhados com Supabase
// ============================================================

// ── Categorias de itens ──────────────────────────────────────
export type Categoria =
  | "crew"
  | "equipamento"
  | "pos_producao"
  | "despesas"
  | "outro";

export const CATEGORIAS: { value: Categoria; label: string; color: string }[] = [
  { value: "crew", label: "Equipa (Crew)", color: "#1a8fa3" },
  { value: "equipamento", label: "Equipamento", color: "#8b6b56" },
  { value: "pos_producao", label: "Pós-Produção", color: "#7c3aed" },
  { value: "despesas", label: "Despesas", color: "#d97706" },
  { value: "outro", label: "Outro", color: "#5a6280" },
];

// ── IVA Portugal ─────────────────────────────────────────────
export type IvaRegime =
  | "continental_23"
  | "madeira_22"
  | "acores_16"
  | "isento";

export const IVA_REGIMES: { value: IvaRegime; label: string; rate: number }[] = [
  { value: "continental_23", label: "Continental (23%)", rate: 23 },
  { value: "madeira_22", label: "Madeira (22%)", rate: 22 },
  { value: "acores_16", label: "Açores (16%)", rate: 16 },
  { value: "isento", label: "Isento / Art. 53.º (0%)", rate: 0 },
];

export function getIvaRate(regime: IvaRegime): number {
  return IVA_REGIMES.find((r) => r.value === regime)?.rate ?? 23;
}

// ── Rates (tarifas base) ─────────────────────────────────────
export interface Rate {
  id: string;
  user_id: string;
  category: string;
  name: string;
  unit: string;
  base_rate: number;
  min_rate: number;
  notes: string | null;
  created_at: string;
}

// ── Templates ────────────────────────────────────────────────
export interface Template {
  id: string;
  user_id: string;
  name: string;
  type: "institutional" | "shortform" | "documentary" | "event" | "custom";
  defaults: Record<string, unknown>;
  created_at: string;
}

// ── Item de orçamento ────────────────────────────────────────
export interface ProjectItem {
  id: string;
  categoria: Categoria;
  nome: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
  total: number;
  notas?: string;
}

// ── Resultado do cálculo ─────────────────────────────────────
export interface ProjectCalc {
  custo_crew: number;
  custo_equipamento: number;
  custo_pos: number;
  custo_despesas: number;
  custo_outro: number;
  custo_direto: number;
  overhead_valor: number;
  subtotal_com_overhead: number;
  contingencia_valor: number;
  subtotal_com_contingencia: number;
  investimento_valor: number;
  subtotal_pre_iva: number;
  iva_valor: number;
  preco_recomendado: number;
  preco_recomendado_com_iva: number;
  margem_alvo_valor: number;
  preco_minimo: number;
  preco_minimo_com_iva: number;
  margem_minima_valor: number;
}

// ── Inputs do projeto (jsonb) ────────────────────────────────
export interface ProjectInputs {
  itens: ProjectItem[];
  overhead_pct: number;
  contingencia_pct: number;
  margem_alvo_pct: number;
  margem_minima_pct: number;
  investimento_pct: number;
  iva_regime: IvaRegime;
  descricao?: string;
  data_projeto?: string;
  localidade?: string;
  cidade?: string;
  pais?: string;
  lat?: number;
  lng?: number;
  observacoes?: string;
  condicoes?: string;
}

// ── Projeto ──────────────────────────────────────────────────
export type ProjectStatus =
  | "draft"
  | "sent"
  | "in_review"
  | "approved"
  | "cancelled"
  | "archived"
  // legacy values still accepted while old rows are migrated
  | "rascunho"
  | "enviado"
  | "aprovado"
  | "cancelado"
  | "arquivado";

export function normalizeProjectStatus(status: string | null | undefined): ProjectStatus {
  const value = (status ?? "").trim().toLowerCase();
  if (value === "rascunho") return "draft";
  if (value === "enviado") return "sent";
  if (value === "aprovado") return "approved";
  if (value === "cancelado") return "cancelled";
  if (value === "arquivado") return "archived";
  if (value === "draft" || value === "sent" || value === "in_review" || value === "approved" || value === "cancelled" || value === "archived") {
    return value;
  }
  return "draft";
}

export const PROJECT_STATUS: { value: ProjectStatus; label: string; badge: string }[] = [
  { value: "draft", label: "Draft", badge: "badge-default" },
  { value: "sent", label: "Enviado", badge: "badge-accent" },
  { value: "in_review", label: "Em revisão", badge: "badge-warning" },
  { value: "approved", label: "Aprovado", badge: "badge-success" },
  { value: "cancelled", label: "Cancelado", badge: "badge-error" },
  { value: "archived", label: "Arquivado", badge: "badge-warning" },
];

export interface Project {
  id: string;
  user_id: string;
  client_name: string;
  project_name: string;
  inputs: ProjectInputs;
  calc: ProjectCalc;
  status: ProjectStatus;
  created_at: string;
  updated_at?: string;
}

// ── Checklist ────────────────────────────────────────────────
export type ChecklistFase = "pre_producao" | "rodagem" | "pos_producao";

export const CHECKLIST_FASES: { value: ChecklistFase; label: string; color: string }[] = [
  { value: "pre_producao", label: "Pré-Produção", color: "#1a8fa3" },
  { value: "rodagem", label: "Rodagem", color: "#d97706" },
  { value: "pos_producao", label: "Pós-Produção", color: "#7c3aed" },
];

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  fase: ChecklistFase;
  texto: string;
  concluido: boolean;
  ordem: number;
  created_at: string;
}

export interface Checklist {
  id: string;
  project_id: string;
  user_id: string;
  nome: string;
  created_at: string;
  items?: ChecklistItem[];
}

// ── Preferências do utilizador ───────────────────────────────
export interface Preferences {
  id: string;
  user_id: string;
  iva_regime: IvaRegime;
  overhead_pct: number;
  contingencia_pct: number;
  margem_alvo_pct: number;
  margem_minima_pct: number;
  investimento_pct: number;
  moeda: string;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_PREFERENCES: Omit<Preferences, "id" | "user_id" | "created_at" | "updated_at"> = {
  iva_regime: "continental_23",
  overhead_pct: 15,
  contingencia_pct: 10,
  margem_alvo_pct: 30,
  margem_minima_pct: 15,
  investimento_pct: 0,
  moeda: "EUR",
};
