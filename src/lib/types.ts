// ============================================================
// Tipos alinhados com o schema REAL do Supabase
// ============================================================

export type Categoria =
  | "crew"
  | "equipamento"
  | "pos_producao"
  | "despesas"
  | "outro";

export const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "crew", label: "Equipa (Crew)" },
  { value: "equipamento", label: "Equipamento" },
  { value: "pos_producao", label: "Pós-Produção" },
  { value: "despesas", label: "Despesas" },
  { value: "outro", label: "Outro" },
];

// --- rates ---
// DB: id, user_id, category, name, unit, base_rate, min_rate, notes, created_at
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

// --- templates ---
// DB: id, user_id, name, defaults (jsonb), created_at
export interface Template {
  id: string;
  user_id: string;
  name: string;
  defaults: Record<string, unknown>;
  created_at: string;
}

// --- Item de orçamento (guardado dentro de projects.inputs) ---
export interface ProjectItem {
  id: string;
  categoria: Categoria;
  nome: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
  total: number;
}

// --- Resultado do cálculo (guardado em projects.calc) ---
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
  preco_recomendado: number;
  margem_alvo_valor: number;
  preco_minimo: number;
  margem_minima_valor: number;
}

// --- Estrutura do campo inputs (jsonb) ---
export interface ProjectInputs {
  itens: ProjectItem[];
  overhead_pct: number;
  contingencia_pct: number;
  margem_alvo_pct: number;
  margem_minima_pct: number;
  descricao?: string;
  data_projeto?: string;
  observacoes?: string;
  condicoes?: string;
}

// --- projects ---
// DB: id, user_id, client_name, project_name, inputs (jsonb), calc (jsonb), status, created_at
export interface Project {
  id: string;
  user_id: string;
  client_name: string;
  project_name: string;
  inputs: ProjectInputs;
  calc: ProjectCalc;
  status: string;
  created_at: string;
}
