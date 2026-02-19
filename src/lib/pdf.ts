import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { CATEGORIAS, IVA_REGIMES, type Project, type ProjectInputs, type ProjectCalc } from "./types";

// ── Helpers ────────────────────────────────────────────────────
const fmtN = (n: number) =>
  n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtEurPdf = (n: number) => `${fmtN(n)} \u20AC`;

const catLabel = (cat: string) =>
  CATEGORIAS.find((c) => c.value === cat)?.label ?? cat;

// Brand palette
const BRAND_TEAL   = rgb(0.102, 0.561, 0.639);  // #1a8fa3
const BRAND_DARK   = rgb(0.031, 0.043, 0.063);  // #080b10
const GRAY_MED     = rgb(0.42,  0.46,  0.52);
const GRAY_LIGHT   = rgb(0.88,  0.90,  0.92);
const GRAY_TEXT    = rgb(0.18,  0.20,  0.24);
const WHITE        = rgb(1,     1,     1);
const SURFACE_DIM  = rgb(0.09,  0.11,  0.16);

interface PdfCtx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  pages: PDFPage[];
  page: PDFPage;
  y: number;
  margin: number;
  pageW: number;
  pageH: number;
  contentW: number;
}

function addPage(ctx: PdfCtx): PDFPage {
  const p = ctx.doc.addPage([ctx.pageW, ctx.pageH]);
  ctx.pages.push(p);
  ctx.page = p;
  ctx.y = ctx.pageH - ctx.margin;
  return p;
}

function needPage(ctx: PdfCtx, needed: number) {
  if (ctx.y - needed < ctx.margin + 40) addPage(ctx);
}

function drawText(
  ctx: PdfCtx,
  t: string,
  x: number,
  yPos: number,
  size: number,
  f: PDFFont,
  color = GRAY_TEXT
) {
  ctx.page.drawText(t, { x, y: yPos, size, font: f, color });
}

function drawTextRight(
  ctx: PdfCtx,
  t: string,
  yPos: number,
  size: number,
  f: PDFFont,
  color = GRAY_TEXT
) {
  const w = f.widthOfTextAtSize(t, size);
  drawText(ctx, t, ctx.pageW - ctx.margin - w, yPos, size, f, color);
}

function drawHRule(ctx: PdfCtx, alpha = 0.15) {
  ctx.page.drawLine({
    start: { x: ctx.margin, y: ctx.y },
    end:   { x: ctx.pageW - ctx.margin, y: ctx.y },
    thickness: 0.5,
    color: rgb(0.85, 0.87, 0.90),
    opacity: alpha > 1 ? 1 : alpha,
  });
}

// ── Main export ────────────────────────────────────────────────
export async function generatePdf(project: Project): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW    = 595.28;
  const pageH    = 841.89;
  const margin   = 52;
  const contentW = pageW - margin * 2;

  const ctx: PdfCtx = {
    doc, font, bold,
    pages: [],
    page: doc.addPage([pageW, pageH]),
    y: pageH - margin,
    margin, pageW, pageH, contentW,
  };
  ctx.pages.push(ctx.page);

  const inp: ProjectInputs = project.inputs ?? {
    itens: [], overhead_pct: 0, contingencia_pct: 0,
    margem_alvo_pct: 0, margem_minima_pct: 0, investimento_pct: 0,
    iva_regime: "continental_23",
  };
  const c: ProjectCalc = project.calc;

  // ── Cover / header strip ─────────────────────────────────────
  // Dark header band
  ctx.page.drawRectangle({
    x: 0, y: pageH - 80,
    width: pageW, height: 80,
    color: BRAND_DARK,
  });

  // Teal accent left line
  ctx.page.drawRectangle({
    x: 0, y: pageH - 80,
    width: 4, height: 80,
    color: BRAND_TEAL,
  });

  drawText(ctx, "BEYOND PRICING", margin, pageH - 32, 16, bold, WHITE);
  drawText(ctx, "Proposta de Orçamento", margin, pageH - 52, 9, font, rgb(0.6, 0.7, 0.75));

  const dateStr = inp.data_projeto
    ? new Date(inp.data_projeto).toLocaleDateString("pt-PT")
    : new Date().toLocaleDateString("pt-PT");
  drawTextRight(ctx, dateStr, pageH - 42, 8, font, rgb(0.6, 0.7, 0.75));

  ctx.y = pageH - 80 - 24;

  // ── Project meta ─────────────────────────────────────────────
  drawText(ctx, project.project_name, margin, ctx.y, 14, bold, GRAY_TEXT);
  ctx.y -= 16;

  if (project.client_name) {
    drawText(ctx, `Cliente: ${project.client_name}`, margin, ctx.y, 9, font, GRAY_MED);
    ctx.y -= 14;
  }
  if (inp.cidade || inp.localidade) {
    const loc = [inp.cidade, inp.localidade, inp.pais].filter(Boolean).join(", ");
    drawText(ctx, `Local: ${loc}`, margin, ctx.y, 9, font, GRAY_MED);
    ctx.y -= 14;
  }
  if (inp.descricao) {
    ctx.y -= 4;
    drawText(ctx, inp.descricao, margin, ctx.y, 8, font, GRAY_MED);
    ctx.y -= 14;
  }

  ctx.y -= 8;
  drawHRule(ctx, 1);
  ctx.y -= 20;

  // ── Items by category ─────────────────────────────────────────
  const itens = inp.itens ?? [];
  const usedCats = CATEGORIAS.filter((cat) => itens.some((i) => i.categoria === cat.value));

  for (const cat of usedCats) {
    const catItems = itens.filter((i) => i.categoria === cat.value);
    const subtotal = catItems.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);

    needPage(ctx, 24 + catItems.length * 14 + 18);

    // Category header band
    ctx.page.drawRectangle({
      x: margin - 2, y: ctx.y - 5,
      width: contentW + 4, height: 18,
      color: SURFACE_DIM,
    });
    drawText(ctx, catLabel(cat.value).toUpperCase(), margin + 4, ctx.y + 1, 7.5, bold, BRAND_TEAL);
    drawTextRight(ctx, fmtEurPdf(subtotal), ctx.y + 1, 8, bold, BRAND_TEAL);
    ctx.y -= 20;

    // Column headers
    const c0 = margin + 4;
    const c1 = margin + 200;
    const c2 = margin + 280;
    const c3 = margin + 340;

    drawText(ctx, "Descrição", c0, ctx.y, 7, bold, GRAY_MED);
    drawText(ctx, "Unid.", c1, ctx.y, 7, bold, GRAY_MED);
    drawText(ctx, "Qtd.", c2, ctx.y, 7, bold, GRAY_MED);
    drawText(ctx, "P.Unit.", c3, ctx.y, 7, bold, GRAY_MED);
    drawTextRight(ctx, "Total", ctx.y, 7, bold, GRAY_MED);
    ctx.y -= 4;
    drawHRule(ctx, 0.5);
    ctx.y -= 10;

    for (const item of catItems) {
      needPage(ctx, 14);
      const total = item.quantidade * item.preco_unitario;
      const nameTrunc = item.nome.length > 38 ? item.nome.slice(0, 36) + "…" : item.nome;
      drawText(ctx, nameTrunc, c0, ctx.y, 8, font, GRAY_TEXT);
      drawText(ctx, item.unidade, c1, ctx.y, 8, font, GRAY_MED);
      drawText(ctx, String(item.quantidade), c2, ctx.y, 8, font, GRAY_TEXT);
      drawText(ctx, fmtN(item.preco_unitario), c3, ctx.y, 8, font, GRAY_TEXT);
      drawTextRight(ctx, fmtEurPdf(total), ctx.y, 8, font, GRAY_TEXT);
      ctx.y -= 13;
    }
    ctx.y -= 10;
  }

  // ── Summary ──────────────────────────────────────────────────
  needPage(ctx, 200);
  ctx.y -= 6;
  drawHRule(ctx, 1);
  ctx.y -= 22;

  drawText(ctx, "RESUMO FINANCEIRO", margin, ctx.y, 11, bold, BRAND_TEAL);
  ctx.y -= 22;

  // IVA label
  const ivaRegime = IVA_REGIMES.find((r) => r.value === inp.iva_regime);
  const ivaRate   = ivaRegime?.rate ?? 23;

  const summaryRows: Array<[string, string, boolean?]> = [
    ["Custo Direto", fmtEurPdf(c.custo_direto)],
    [`Overhead (${inp.overhead_pct}%)`, fmtEurPdf(c.overhead_valor)],
    [`Contingência (${inp.contingencia_pct}%)`, fmtEurPdf(c.contingencia_valor)],
    ...(c.investimento_valor > 0
      ? [[`Investimento Equip. (${inp.investimento_pct}%)`, fmtEurPdf(c.investimento_valor)] as [string, string]]
      : []),
    ["Subtotal (s/ IVA)", fmtEurPdf(c.preco_recomendado), true],
    [`${ivaRate > 0 ? `IVA (${ivaRate}%)` : "IVA (Isento)"}`, fmtEurPdf(c.iva_valor)],
  ];

  for (const [label, value, isBold] of summaryRows) {
    needPage(ctx, 16);
    drawText(ctx, label, margin + 6, ctx.y, 9, isBold ? bold : font, GRAY_TEXT);
    drawTextRight(ctx, value, ctx.y, 9, isBold ? bold : font, GRAY_TEXT);
    ctx.y -= 16;
  }

  ctx.y -= 6;
  drawHRule(ctx, 1);
  ctx.y -= 20;

  // Recommended price highlight
  ctx.page.drawRectangle({
    x: margin, y: ctx.y - 8,
    width: contentW, height: 28,
    color: rgb(0.04, 0.08, 0.10),
  });
  ctx.page.drawRectangle({
    x: margin, y: ctx.y - 8,
    width: 3, height: 28,
    color: BRAND_TEAL,
  });
  const recLabel = `Preço Recomendado  (margem ${inp.margem_alvo_pct}%)`;
  drawText(ctx, recLabel, margin + 10, ctx.y + 4, 9, bold, rgb(0.7, 0.9, 0.95));
  drawTextRight(ctx, fmtEurPdf(c.preco_recomendado_com_iva ?? c.preco_recomendado), ctx.y + 4, 11, bold, WHITE);
  ctx.y -= 36;

  // Min price
  drawText(ctx, `Preço Mínimo (margem ${inp.margem_minima_pct}%)`, margin + 6, ctx.y, 9, font, GRAY_MED);
  drawTextRight(ctx, fmtEurPdf(c.preco_minimo_com_iva ?? c.preco_minimo), ctx.y, 9, bold, GRAY_TEXT);
  ctx.y -= 28;

  // Margin breakdown
  const margem = c.preco_recomendado > 0
    ? ((c.margem_alvo_valor / c.preco_recomendado) * 100).toFixed(1)
    : "0.0";
  drawText(ctx, `Margem líquida: ${margem}% · Alvo: ${inp.margem_alvo_pct}%`, margin + 6, ctx.y, 8, font, GRAY_MED);
  ctx.y -= 20;

  // ── Notes ─────────────────────────────────────────────────────
  if (inp.observacoes || inp.condicoes) {
    needPage(ctx, 80);
    drawHRule(ctx, 1);
    ctx.y -= 18;

    for (const [title, body] of [
      ["Observações", inp.observacoes],
      ["Condições Comerciais", inp.condicoes],
    ] as Array<[string, string | undefined]>) {
      if (!body) continue;
      needPage(ctx, 40);
      drawText(ctx, title, margin, ctx.y, 9, bold, GRAY_TEXT);
      ctx.y -= 14;

      const words = body.split(" ");
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, 8) > contentW - 8) {
          needPage(ctx, 14);
          drawText(ctx, line, margin + 6, ctx.y, 8, font, GRAY_MED);
          ctx.y -= 12;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) { needPage(ctx, 14); drawText(ctx, line, margin + 6, ctx.y, 8, font, GRAY_MED); ctx.y -= 12; }
      ctx.y -= 8;
    }
  }

  // ── Footer on all pages ───────────────────────────────────────
  const allPages = ctx.doc.getPages();
  for (let i = 0; i < allPages.length; i++) {
    const p = allPages[i];
    // Footer rule
    p.drawLine({
      start: { x: margin, y: 38 },
      end:   { x: pageW - margin, y: 38 },
      thickness: 0.5,
      color: GRAY_LIGHT,
    });
    const ft = `Beyond Pricing  ·  Página ${i + 1} de ${allPages.length}`;
    const fw = font.widthOfTextAtSize(ft, 7);
    p.drawText(ft, { x: (pageW - fw) / 2, y: 26, size: 7, font, color: GRAY_MED });
  }

  return doc.save();
}

// ── CSV Export ────────────────────────────────────────────────
export function generateCsv(project: Project): string {
  const inp = project.inputs;
  const c   = project.calc;

  const rows: string[][] = [];

  // Header
  rows.push(["# Beyond Pricing — Exportação CSV"]);
  rows.push(["Projeto", project.project_name]);
  rows.push(["Cliente", project.client_name ?? ""]);
  rows.push(["Data", new Date().toLocaleDateString("pt-PT")]);
  rows.push([]);

  // Items
  rows.push(["Categoria", "Descrição", "Unidade", "Quantidade", "Preço Unit. (€)", "Total (€)"]);

  for (const cat of CATEGORIAS) {
    const catItems = (inp.itens ?? []).filter((i) => i.categoria === cat.value);
    if (catItems.length === 0) continue;
    for (const item of catItems) {
      rows.push([
        catLabel(cat.value),
        item.nome,
        item.unidade,
        String(item.quantidade),
        item.preco_unitario.toFixed(2),
        (item.quantidade * item.preco_unitario).toFixed(2),
      ]);
    }
  }

  rows.push([]);

  // Summary
  rows.push(["# Resumo"]);
  rows.push(["Custo Direto (€)", c.custo_direto.toFixed(2)]);
  rows.push([`Overhead (${inp.overhead_pct}%) (€)`, c.overhead_valor.toFixed(2)]);
  rows.push([`Contingência (${inp.contingencia_pct}%) (€)`, c.contingencia_valor.toFixed(2)]);
  if (c.investimento_valor > 0) {
    rows.push([`Investimento (${inp.investimento_pct}%) (€)`, c.investimento_valor.toFixed(2)]);
  }
  rows.push(["Subtotal s/ IVA (€)", c.preco_recomendado.toFixed(2)]);
  rows.push([`IVA (€)`, c.iva_valor.toFixed(2)]);
  rows.push(["Preço Recomendado c/ IVA (€)", (c.preco_recomendado_com_iva ?? c.preco_recomendado).toFixed(2)]);
  rows.push(["Preço Mínimo c/ IVA (€)", (c.preco_minimo_com_iva ?? c.preco_minimo).toFixed(2)]);

  return rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
}
