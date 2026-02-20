/**
 * GET /api/export/pptx?projectId=xxx
 * Generates a .pptx presentation from a project budget.
 * No OpenAI required — pure local generation via pptxgenjs.
 * Runtime: nodejs (not edge)
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import PptxGenJS from "pptxgenjs";
import { CATEGORIAS, IVA_REGIMES, type Project, type ProjectItem } from "@/lib/types";

// ── Beyond brand colours ──────────────────────────────────────
const BRAND = {
  bg: "080B10",
  accent: "1A8FA3",
  accentDark: "0D6B7E",
  text: "F0F4F8",
  text2: "8B98B0",
  surface: "0D1117",
  surface2: "131820",
  border: "1E2736",
  white: "FFFFFF",
  success: "34D399",
  warning: "F59E0B",
  error: "F87171",
  crew: "1A8FA3",
  equipamento: "8B6B56",
  pos_producao: "7C3AED",
  despesas: "D97706",
  outro: "5A6280",
} as const;

function fmtEur(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function fmtPct(v: number) { return `${v.toFixed(1)}%`; }

// ── Slide helpers ─────────────────────────────────────────────
function addSlide(pptx: PptxGenJS) {
  return () => pptx.addSlide();
}

function bgFill(color: string) {
  return { type: "solid" as const, color };
}

function addBgRect(slide: ReturnType<PptxGenJS["addSlide"]>) {
  slide.addShape("rect", {
    x: 0, y: 0, w: "100%", h: "100%",
    fill: bgFill(BRAND.bg),
    line: { color: BRAND.bg },
  });
}

function addAccentLine(slide: ReturnType<PptxGenJS["addSlide"]>, y = 0.08) {
  slide.addShape("rect", {
    x: 0, y, w: "100%", h: 0.04,
    fill: bgFill(BRAND.accent),
    line: { color: BRAND.accent },
  });
}

function addFooter(slide: ReturnType<PptxGenJS["addSlide"]>, pageNum: number, total: number) {
  slide.addText(`Beyond Focus Studios  ·  ${pageNum} / ${total}`, {
    x: 0, y: 5.1, w: "100%", h: 0.3,
    align: "center",
    fontSize: 8,
    color: BRAND.text2,
    fontFace: "Helvetica",
  });
}

// ── SLIDE 1: Cover ────────────────────────────────────────────
function slide1Cover(pptx: PptxGenJS, project: Project, totalPages: number) {
  const slide = addSlide(pptx)();
  addBgRect(slide);
  // Top accent bar
  addAccentLine(slide, 0);
  // Bottom accent bar
  addAccentLine(slide, 5.38);

  // Big gradient rect centre
  slide.addShape("rect", {
    x: 0.5, y: 1.0, w: 8.5, h: 3.2,
    fill: bgFill(BRAND.surface2),
    line: { color: BRAND.border, pt: 1 },
  });

  // Logo mark "B"
  slide.addShape("rect", {
    x: 0.7, y: 1.2, w: 0.7, h: 0.7,
    fill: bgFill(BRAND.accent),
    line: { color: BRAND.accent },
  });
  slide.addText("B", {
    x: 0.7, y: 1.2, w: 0.7, h: 0.7,
    align: "center", valign: "middle",
    fontSize: 24, bold: true, color: BRAND.white, fontFace: "Helvetica",
  });

  slide.addText("BEYOND FOCUS STUDIOS", {
    x: 1.55, y: 1.25, w: 6.5, h: 0.35,
    fontSize: 11, color: BRAND.accent, bold: true, fontFace: "Helvetica",
  });
  slide.addText("Proposta de Produção Audiovisual", {
    x: 1.55, y: 1.58, w: 6.5, h: 0.3,
    fontSize: 9, color: BRAND.text2, fontFace: "Helvetica",
  });

  // Project name
  slide.addText(project.project_name || "Sem título", {
    x: 0.7, y: 2.1, w: 8.0, h: 0.8,
    fontSize: 28, bold: true, color: BRAND.text, fontFace: "Helvetica",
    wrap: true,
  });

  // Client + date row
  const clientName = project.client_name || "—";
  const dateStr = project.inputs?.data_projeto
    ? new Date(project.inputs.data_projeto).toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("pt-PT", { year: "numeric", month: "long" });

  slide.addText(`Cliente: ${clientName}`, {
    x: 0.7, y: 3.0, w: 4.0, h: 0.35,
    fontSize: 10, color: BRAND.text2, fontFace: "Helvetica",
  });
  slide.addText(`Data: ${dateStr}`, {
    x: 0.7, y: 3.35, w: 4.0, h: 0.35,
    fontSize: 10, color: BRAND.text2, fontFace: "Helvetica",
  });

  // Status badge
  const status = project.status?.toUpperCase() ?? "RASCUNHO";
  slide.addText(status, {
    x: 7.2, y: 3.0, w: 1.5, h: 0.4,
    align: "center", valign: "middle",
    fontSize: 9, bold: true, color: BRAND.accent, fontFace: "Helvetica",
    fill: bgFill(BRAND.surface),
    line: { color: BRAND.accent, pt: 1 },
  });

  addFooter(slide, 1, totalPages);
}

// ── SLIDE 2: Summary ──────────────────────────────────────────
function slide2Summary(pptx: PptxGenJS, project: Project, totalPages: number) {
  const slide = addSlide(pptx)();
  addBgRect(slide);
  addAccentLine(slide, 0);

  slide.addText("Resumo Executivo", {
    x: 0.4, y: 0.15, w: 9.0, h: 0.5,
    fontSize: 20, bold: true, color: BRAND.text, fontFace: "Helvetica",
  });

  const c = project.calc;
  const ivaRate = IVA_REGIMES.find(r => r.value === project.inputs?.iva_regime)?.rate ?? 23;

  const rows = [
    ["Investimento Total (c/ IVA)", fmtEur(c.preco_recomendado_com_iva), BRAND.accent],
    ["Valor sem IVA", fmtEur(c.preco_recomendado), BRAND.text],
    [`IVA (${ivaRate}%)`, fmtEur(c.iva_valor), BRAND.text2],
    ["Custo Direto", fmtEur(c.custo_direto), BRAND.text2],
    ["Overhead", fmtEur(c.overhead_valor), BRAND.text2],
    ["Contingência", fmtEur(c.contingencia_valor), BRAND.text2],
    ["Margem Objectivo", fmtEur(c.margem_alvo_valor), BRAND.success],
    ["Preço Mínimo (c/ IVA)", fmtEur(c.preco_minimo_com_iva), BRAND.warning],
    ["Investimento %", fmtPct(project.inputs?.investimento_pct ?? 0), BRAND.text2],
    ["Dias de Rodagem", String(countShootingDays(project.inputs?.itens ?? [])), BRAND.text2],
  ];

  const colW = [4.0, 2.5];
  const rowH = 0.44;
  const startX = 0.4;
  const startY = 0.75;

  rows.forEach(([label, value, color], i) => {
    const y = startY + i * rowH;
    const bg = i === 0 ? BRAND.surface2 : i % 2 === 0 ? BRAND.surface : BRAND.bg;
    slide.addShape("rect", { x: startX, y, w: colW[0] + colW[1], h: rowH - 0.03, fill: bgFill(bg), line: { color: BRAND.border, pt: 0.5 } });
    slide.addText(label, { x: startX + 0.1, y, w: colW[0] - 0.1, h: rowH, fontSize: i === 0 ? 11 : 9.5, bold: i === 0, color: BRAND.text, fontFace: "Helvetica", valign: "middle" });
    slide.addText(value, { x: startX + colW[0], y, w: colW[1], h: rowH, fontSize: i === 0 ? 13 : 10, bold: i === 0, color: color, fontFace: "Helvetica", valign: "middle", align: "right" });
  });

  addFooter(slide, 2, totalPages);
}

function countShootingDays(itens: ProjectItem[]): number {
  const crew = itens.filter(i => i.categoria === "crew");
  if (!crew.length) return 0;
  const maxQty = Math.max(...crew.map(i => i.quantidade));
  return Math.round(maxQty);
}

// ── SLIDE 3: Category breakdown ───────────────────────────────
function slide3Breakdown(pptx: PptxGenJS, project: Project, totalPages: number) {
  const slide = addSlide(pptx)();
  addBgRect(slide);
  addAccentLine(slide, 0);

  slide.addText("Breakdown por Categoria", {
    x: 0.4, y: 0.15, w: 9.0, h: 0.5,
    fontSize: 20, bold: true, color: BRAND.text, fontFace: "Helvetica",
  });

  const c = project.calc;
  const catData = [
    { label: "Equipa (Crew)", value: c.custo_crew, color: BRAND.crew },
    { label: "Equipamento", value: c.custo_equipamento, color: BRAND.equipamento },
    { label: "Pós-Produção", value: c.custo_pos, color: BRAND.pos_producao },
    { label: "Despesas", value: c.custo_despesas, color: BRAND.despesas },
    { label: "Outro", value: c.custo_outro, color: BRAND.outro },
  ].filter(d => d.value > 0);

  const total = catData.reduce((s, d) => s + d.value, 0) || 1;

  // Table
  const startY = 0.78;
  const rowH = 0.52;
  const colWs = [3.2, 1.8, 1.5, 1.5];
  const headers = ["Categoria", "Valor", "% do Total", "Barra"];

  headers.forEach((h, ci) => {
    const x = 0.4 + colWs.slice(0, ci).reduce((a, b) => a + b, 0);
    slide.addShape("rect", { x, y: startY, w: colWs[ci], h: rowH - 0.04, fill: bgFill(BRAND.accent), line: { color: BRAND.accent } });
    slide.addText(h, { x, y: startY, w: colWs[ci], h: rowH, fontSize: 9, bold: true, color: BRAND.white, fontFace: "Helvetica", valign: "middle", align: ci === 0 ? "left" : "center" });
  });

  catData.forEach((d, ri) => {
    const y = startY + rowH * (ri + 1);
    const pct = d.value / total;
    const bg = ri % 2 === 0 ? BRAND.surface : BRAND.bg;

    colWs.forEach((w, ci) => {
      const x = 0.4 + colWs.slice(0, ci).reduce((a, b) => a + b, 0);
      slide.addShape("rect", { x, y, w, h: rowH - 0.04, fill: bgFill(bg), line: { color: BRAND.border, pt: 0.5 } });
    });

    // Col 0: label with colour dot
    slide.addShape("rect", { x: 0.5, y: y + 0.15, w: 0.12, h: 0.12, fill: bgFill(d.color), line: { color: d.color } });
    slide.addText(d.label, { x: 0.68, y, w: 3.0, h: rowH, fontSize: 9.5, color: BRAND.text, fontFace: "Helvetica", valign: "middle" });
    // Col 1: value
    slide.addText(fmtEur(d.value), { x: 0.4 + colWs[0], y, w: colWs[1], h: rowH, fontSize: 9.5, color: BRAND.accent, fontFace: "Helvetica", valign: "middle", align: "center" });
    // Col 2: pct
    slide.addText(fmtPct(pct * 100), { x: 0.4 + colWs[0] + colWs[1], y, w: colWs[2], h: rowH, fontSize: 9.5, color: BRAND.text2, fontFace: "Helvetica", valign: "middle", align: "center" });
    // Col 3: bar
    const barX = 0.4 + colWs[0] + colWs[1] + colWs[2] + 0.1;
    const barW = colWs[3] - 0.2;
    slide.addShape("rect", { x: barX, y: y + 0.15, w: barW, h: 0.18, fill: bgFill(BRAND.surface2), line: { color: BRAND.border, pt: 0.5 } });
    if (pct > 0) {
      slide.addShape("rect", { x: barX, y: y + 0.15, w: barW * pct, h: 0.18, fill: bgFill(d.color), line: { color: d.color } });
    }
  });

  // Total row
  const totalY = startY + rowH * (catData.length + 1);
  slide.addShape("rect", { x: 0.4, y: totalY, w: colWs[0] + colWs[1] + colWs[2], h: rowH - 0.04, fill: bgFill(BRAND.surface2), line: { color: BRAND.accent, pt: 1 } });
  slide.addText("TOTAL DIRETO", { x: 0.5, y: totalY, w: colWs[0], h: rowH, fontSize: 10, bold: true, color: BRAND.text, fontFace: "Helvetica", valign: "middle" });
  slide.addText(fmtEur(total), { x: 0.4 + colWs[0], y: totalY, w: colWs[1], h: rowH, fontSize: 10, bold: true, color: BRAND.accent, fontFace: "Helvetica", valign: "middle", align: "center" });
  slide.addText("100%", { x: 0.4 + colWs[0] + colWs[1], y: totalY, w: colWs[2], h: rowH, fontSize: 10, bold: true, color: BRAND.text2, fontFace: "Helvetica", valign: "middle", align: "center" });

  addFooter(slide, 3, totalPages);
}

// ── SLIDE 4: Top items ────────────────────────────────────────
function slide4TopItems(pptx: PptxGenJS, project: Project, totalPages: number) {
  const slide = addSlide(pptx)();
  addBgRect(slide);
  addAccentLine(slide, 0);

  slide.addText("Principais Itens por Custo", {
    x: 0.4, y: 0.15, w: 9.0, h: 0.5,
    fontSize: 20, bold: true, color: BRAND.text, fontFace: "Helvetica",
  });

  const items = [...(project.inputs?.itens ?? [])]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const startY = 0.78;
  const rowH = 0.46;
  const headers = ["Item", "Categoria", "Qtd", "Unit.", "Total"];
  const colWs = [3.4, 1.6, 0.7, 1.3, 1.6];

  headers.forEach((h, ci) => {
    const x = 0.4 + colWs.slice(0, ci).reduce((a, b) => a + b, 0);
    slide.addShape("rect", { x, y: startY, w: colWs[ci], h: rowH - 0.04, fill: bgFill(BRAND.accentDark), line: { color: BRAND.accent } });
    slide.addText(h, { x, y: startY, w: colWs[ci], h: rowH, fontSize: 9, bold: true, color: BRAND.white, fontFace: "Helvetica", valign: "middle", align: ci === 0 ? "left" : "center" });
  });

  items.forEach((item, ri) => {
    const y = startY + rowH * (ri + 1);
    const bg = ri % 2 === 0 ? BRAND.surface : BRAND.bg;
    const catColor = BRAND[item.categoria as keyof typeof BRAND] as string ?? BRAND.text2;
    const catLabel = CATEGORIAS.find(c => c.value === item.categoria)?.label ?? item.categoria;

    colWs.forEach((w, ci) => {
      const x = 0.4 + colWs.slice(0, ci).reduce((a, b) => a + b, 0);
      slide.addShape("rect", { x, y, w, h: rowH - 0.04, fill: bgFill(bg), line: { color: BRAND.border, pt: 0.5 } });
    });

    slide.addText(item.nome, { x: 0.5, y, w: colWs[0] - 0.1, h: rowH, fontSize: 8.5, color: BRAND.text, fontFace: "Helvetica", valign: "middle" });
    slide.addText(catLabel, { x: 0.4 + colWs[0], y, w: colWs[1], h: rowH, fontSize: 8, color: catColor, fontFace: "Helvetica", valign: "middle", align: "center" });
    slide.addText(String(item.quantidade), { x: 0.4 + colWs[0] + colWs[1], y, w: colWs[2], h: rowH, fontSize: 8.5, color: BRAND.text2, fontFace: "Helvetica", valign: "middle", align: "center" });
    slide.addText(fmtEur(item.preco_unitario), { x: 0.4 + colWs[0] + colWs[1] + colWs[2], y, w: colWs[3], h: rowH, fontSize: 8.5, color: BRAND.text2, fontFace: "Helvetica", valign: "middle", align: "right" });
    slide.addText(fmtEur(item.total), { x: 0.4 + colWs[0] + colWs[1] + colWs[2] + colWs[3], y, w: colWs[4], h: rowH, fontSize: 9, bold: true, color: BRAND.accent, fontFace: "Helvetica", valign: "middle", align: "right" });
  });

  if (!items.length) {
    slide.addText("Sem itens no orçamento.", { x: 0.4, y: 1.5, w: 9.0, h: 0.5, fontSize: 11, color: BRAND.text2, fontFace: "Helvetica" });
  }

  addFooter(slide, 4, totalPages);
}

// ── SLIDE 5: Deliverables ─────────────────────────────────────
function slide5Deliverables(pptx: PptxGenJS, project: Project, totalPages: number) {
  const slide = addSlide(pptx)();
  addBgRect(slide);
  addAccentLine(slide, 0);

  slide.addText("Entregáveis e Prazos", {
    x: 0.4, y: 0.15, w: 9.0, h: 0.5,
    fontSize: 20, bold: true, color: BRAND.text, fontFace: "Helvetica",
  });

  // If we have a description, use it
  const desc = project.inputs?.descricao;
  const obs = project.inputs?.observacoes;
  const condicoes = project.inputs?.condicoes;

  const items = [
    { icon: "📽", label: "Projeto", value: project.project_name },
    { icon: "👤", label: "Cliente", value: project.client_name },
    { icon: "📍", label: "Local", value: [project.inputs?.localidade, project.inputs?.cidade, project.inputs?.pais].filter(Boolean).join(", ") || "A confirmar" },
    { icon: "📅", label: "Data Estimada", value: project.inputs?.data_projeto ? new Date(project.inputs.data_projeto).toLocaleDateString("pt-PT") : "A confirmar" },
    { icon: "🎬", label: "Dias de Rodagem", value: String(countShootingDays(project.inputs?.itens ?? [])) },
    { icon: "✅", label: "Estado", value: project.status?.toUpperCase() ?? "RASCUNHO" },
  ];

  items.forEach((item, i) => {
    const y = 0.82 + i * 0.55;
    slide.addShape("rect", { x: 0.4, y, w: 8.8, h: 0.46, fill: bgFill(i % 2 === 0 ? BRAND.surface : BRAND.surface2), line: { color: BRAND.border, pt: 0.5 } });
    slide.addText(`${item.icon}  ${item.label}`, { x: 0.55, y, w: 3.0, h: 0.46, fontSize: 10, color: BRAND.text2, fontFace: "Helvetica", valign: "middle" });
    slide.addText(item.value || "—", { x: 3.6, y, w: 5.5, h: 0.46, fontSize: 10, bold: true, color: BRAND.text, fontFace: "Helvetica", valign: "middle" });
  });

  if (desc) {
    slide.addText("Descrição:", { x: 0.4, y: 4.3, w: 2.0, h: 0.3, fontSize: 9, bold: true, color: BRAND.accent, fontFace: "Helvetica" });
    slide.addText(desc.slice(0, 200), { x: 0.4, y: 4.6, w: 8.8, h: 0.5, fontSize: 8.5, color: BRAND.text2, fontFace: "Helvetica", wrap: true });
  }

  if (obs && !desc) {
    slide.addText("Observações:", { x: 0.4, y: 4.3, w: 2.5, h: 0.3, fontSize: 9, bold: true, color: BRAND.accent, fontFace: "Helvetica" });
    slide.addText(obs.slice(0, 200), { x: 0.4, y: 4.6, w: 8.8, h: 0.5, fontSize: 8.5, color: BRAND.text2, fontFace: "Helvetica", wrap: true });
  }

  void condicoes;
  addFooter(slide, 5, totalPages);
}

// ── SLIDE 6: Commercial terms ─────────────────────────────────
function slide6Terms(pptx: PptxGenJS, project: Project, totalPages: number) {
  const slide = addSlide(pptx)();
  addBgRect(slide);
  addAccentLine(slide, 0);

  slide.addText("Termos Comerciais", {
    x: 0.4, y: 0.15, w: 9.0, h: 0.5,
    fontSize: 20, bold: true, color: BRAND.text, fontFace: "Helvetica",
  });

  const total = project.calc.preco_recomendado_com_iva;

  // Payment scenarios
  const scenarios = [
    {
      label: "50 / 50",
      desc: "50% na adjudicação · 50% na entrega final",
      p1: total * 0.5,
      p2: total * 0.5,
      recommended: true,
    },
    {
      label: "30 / 70",
      desc: "30% na adjudicação · 70% na entrega final",
      p1: total * 0.3,
      p2: total * 0.7,
      recommended: false,
    },
    {
      label: "Faseado",
      desc: "33% adjudicação · 33% início rodagem · 34% entrega",
      p1: total * 0.33,
      p2: total * 0.34,
      recommended: false,
    },
  ];

  const startY = 0.85;
  scenarios.forEach((s, i) => {
    const y = startY + i * 1.35;
    const borderColor = s.recommended ? BRAND.accent : BRAND.border;
    slide.addShape("rect", { x: 0.4, y, w: 8.8, h: 1.2, fill: bgFill(BRAND.surface2), line: { color: borderColor, pt: s.recommended ? 2 : 0.5 } });

    if (s.recommended) {
      slide.addText("RECOMENDADO", {
        x: 7.2, y: y + 0.08, w: 1.8, h: 0.28,
        fontSize: 7, bold: true, color: BRAND.accent, fontFace: "Helvetica",
        align: "center",
        fill: bgFill(BRAND.surface),
        line: { color: BRAND.accent, pt: 0.5 },
      });
    }

    slide.addText(s.label, { x: 0.6, y: y + 0.1, w: 3.0, h: 0.4, fontSize: 16, bold: true, color: BRAND.text, fontFace: "Helvetica" });
    slide.addText(s.desc, { x: 0.6, y: y + 0.5, w: 8.0, h: 0.3, fontSize: 9, color: BRAND.text2, fontFace: "Helvetica" });

    slide.addText(`1ª prestação: ${fmtEur(s.p1)}`, { x: 0.6, y: y + 0.82, w: 3.8, h: 0.28, fontSize: 10, color: BRAND.success, fontFace: "Helvetica" });
    slide.addText(`Restante: ${fmtEur(s.p2)}`, { x: 4.5, y: y + 0.82, w: 3.8, h: 0.28, fontSize: 10, color: BRAND.warning, fontFace: "Helvetica" });
  });

  // Validity footer
  slide.addShape("rect", { x: 0.4, y: 4.95, w: 8.8, h: 0.3, fill: bgFill(BRAND.surface), line: { color: BRAND.border, pt: 0.5 } });
  slide.addText("⏱  Proposta válida por 30 dias a partir da data de emissão.", {
    x: 0.6, y: 4.95, w: 8.6, h: 0.3, fontSize: 8.5, color: BRAND.text2, fontFace: "Helvetica", valign: "middle",
  });

  addFooter(slide, 6, totalPages);
}

// ── Main handler ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });
  }

  const { data: project, error: projErr } = await sb
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  // Generate PPTX in memory
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5" (widescreen 16:9)
  pptx.author = "Beyond Focus Studios";
  pptx.company = "Beyond Focus Studios";
  pptx.subject = `Orçamento: ${project.project_name}`;
  pptx.title = project.project_name ?? "Proposta";

  const totalPages = 6;
  const p = project as unknown as Project;

  slide1Cover(pptx, p, totalPages);
  slide2Summary(pptx, p, totalPages);
  slide3Breakdown(pptx, p, totalPages);
  slide4TopItems(pptx, p, totalPages);
  slide5Deliverables(pptx, p, totalPages);
  slide6Terms(pptx, p, totalPages);

  // Export to buffer
  const buffer = await pptx.write({ outputType: "nodebuffer" }) as unknown as ArrayBuffer;
  const uint8 = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : Buffer.from(buffer as unknown as Buffer));

  const safeName = (project.project_name ?? "proposta")
    .replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 50);

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${safeName}.pptx"`,
      "Cache-Control": "no-store",
    },
  });
}
