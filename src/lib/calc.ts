import type { ProjectItem, ProjectCalc, Categoria, IvaRegime } from "./types";
import { getIvaRate } from "./types";

function somaCategoria(itens: ProjectItem[], cat: Categoria): number {
  return itens
    .filter((i) => i.categoria === cat)
    .reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0);
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

export function calcularOrcamento(
  itens: ProjectItem[],
  overheadPct: number,
  contingenciaPct: number,
  margemAlvoPct: number,
  margemMinimaPct: number,
  investimentoPct: number = 0,
  ivaRegime: IvaRegime = "continental_23"
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

  const investimento_valor = subtotal_com_contingencia * (investimentoPct / 100);
  const subtotal_pre_iva = subtotal_com_contingencia + investimento_valor;

  const preco_recomendado =
    margemAlvoPct < 100
      ? subtotal_pre_iva / (1 - margemAlvoPct / 100)
      : subtotal_pre_iva;
  const margem_alvo_valor = preco_recomendado - subtotal_pre_iva;

  const preco_minimo =
    margemMinimaPct < 100
      ? subtotal_pre_iva / (1 - margemMinimaPct / 100)
      : subtotal_pre_iva;
  const margem_minima_valor = preco_minimo - subtotal_pre_iva;

  const ivaTaxa = getIvaRate(ivaRegime);
  const iva_valor = preco_recomendado * (ivaTaxa / 100);
  const preco_recomendado_com_iva = preco_recomendado + iva_valor;
  const preco_minimo_com_iva = preco_minimo * (1 + ivaTaxa / 100);

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
    investimento_valor: round(investimento_valor),
    subtotal_pre_iva: round(subtotal_pre_iva),
    iva_valor: round(iva_valor),
    preco_recomendado: round(preco_recomendado),
    preco_recomendado_com_iva: round(preco_recomendado_com_iva),
    margem_alvo_valor: round(margem_alvo_valor),
    preco_minimo: round(preco_minimo),
    preco_minimo_com_iva: round(preco_minimo_com_iva),
    margem_minima_valor: round(margem_minima_valor),
  };
}
