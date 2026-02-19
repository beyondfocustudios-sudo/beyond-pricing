import type { ProjectItem, ProjectCalc, Categoria } from "./types";

function somaCategoria(itens: ProjectItem[], cat: Categoria): number {
  return itens
    .filter((i) => i.categoria === cat)
    .reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0);
}

export function calcularOrcamento(
  itens: ProjectItem[],
  overheadPct: number,
  contingenciaPct: number,
  margemAlvoPct: number,
  margemMinimaPct: number
): ProjectCalc {
  const custo_crew = somaCategoria(itens, "crew");
  const custo_equipamento = somaCategoria(itens, "equipamento");
  const custo_pos = somaCategoria(itens, "pos_producao");
  const custo_despesas = somaCategoria(itens, "despesas");
  const custo_outro = somaCategoria(itens, "outro");

  const custo_direto =
    custo_crew + custo_equipamento + custo_pos + custo_despesas + custo_outro;

  const overhead_valor = custo_direto * (overheadPct / 100);
  const subtotal_com_overhead = custo_direto + overhead_valor;

  const contingencia_valor = subtotal_com_overhead * (contingenciaPct / 100);
  const subtotal_com_contingencia = subtotal_com_overhead + contingencia_valor;

  const preco_recomendado =
    margemAlvoPct < 100
      ? subtotal_com_contingencia / (1 - margemAlvoPct / 100)
      : subtotal_com_contingencia;
  const margem_alvo_valor = preco_recomendado - subtotal_com_contingencia;

  const preco_minimo =
    margemMinimaPct < 100
      ? subtotal_com_contingencia / (1 - margemMinimaPct / 100)
      : subtotal_com_contingencia;
  const margem_minima_valor = preco_minimo - subtotal_com_contingencia;

  return {
    custo_crew: round(custo_crew),
    custo_equipamento: round(custo_equipamento),
    custo_pos: round(custo_pos),
    custo_despesas: round(custo_despesas),
    custo_outro: round(custo_outro),
    custo_direto: round(custo_direto),
    overhead_valor: round(overhead_valor),
    subtotal_com_overhead: round(subtotal_com_overhead),
    contingencia_valor: round(contingencia_valor),
    subtotal_com_contingencia: round(subtotal_com_contingencia),
    preco_recomendado: round(preco_recomendado),
    margem_alvo_valor: round(margem_alvo_valor),
    preco_minimo: round(preco_minimo),
    margem_minima_valor: round(margem_minima_valor),
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
