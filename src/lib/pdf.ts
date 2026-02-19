import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { CATEGORIAS, type Project, type ProjectInputs } from "./types";

const fmt = (n: number) =>
  n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const catLabel = (cat: string) =>
  CATEGORIAS.find((c) => c.value === cat)?.label ?? cat;

export async function generatePdf(project: Project): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 50;
  const contentW = pageW - margin * 2;

  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const blue = rgb(0.004, 0.439, 0.773);
  const gray = rgb(0.4, 0.4, 0.4);
  const darkGray = rgb(0.2, 0.2, 0.2);
  const lightBg = rgb(0.96, 0.96, 0.96);

  function text(t: string, x: number, yPos: number, size: number, f = font, color = darkGray) {
    page.drawText(t, { x, y: yPos, size, font: f, color });
  }
  function textRight(t: string, yPos: number, size: number, f = font, color = darkGray) {
    const w = f.widthOfTextAtSize(t, size);
    text(t, pageW - margin - w, yPos, size, f, color);
  }
  function line(yPos: number) {
    page.drawLine({ start: { x: margin, y: yPos }, end: { x: pageW - margin, y: yPos }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  }
  function checkPage(needed: number) {
    if (y - needed < margin + 30) { page = doc.addPage([pageW, pageH]); y = pageH - margin; }
  }

  const inp: ProjectInputs = project.inputs ?? { itens: [], overhead_pct: 0, contingencia_pct: 0, margem_alvo_pct: 0, margem_minima_pct: 0 };

  // Header
  text("BEYOND PRICING", margin, y, 18, fontBold, blue);
  y -= 14;
  text("Orcamento de Producao", margin, y, 10, font, gray);
  y -= 30;
  line(y); y -= 20;

  text("Projeto:", margin, y, 9, fontBold, gray);
  text(project.project_name, margin + 50, y, 10, fontBold, darkGray);
  y -= 16;

  if (project.client_name) {
    text("Cliente:", margin, y, 9, fontBold, gray);
    text(project.client_name, margin + 50, y, 10, font, darkGray);
    y -= 16;
  }

  if (inp.data_projeto) {
    text("Data:", margin, y, 9, fontBold, gray);
    text(new Date(inp.data_projeto).toLocaleDateString("pt-PT"), margin + 50, y, 10, font, darkGray);
    y -= 16;
  }
  y -= 14;

  // Breakdown
  const itens = inp.itens ?? [];
  const cats = CATEGORIAS.filter((cat) => itens.some((i) => i.categoria === cat.value));

  for (const cat of cats) {
    const catItems = itens.filter((i) => i.categoria === cat.value);
    const subtotal = catItems.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);

    checkPage(20 + catItems.length * 16 + 10);

    page.drawRectangle({ x: margin, y: y - 4, width: contentW, height: 18, color: lightBg });
    text(catLabel(cat.value), margin + 6, y, 9, fontBold, darkGray);
    textRight(`${fmt(subtotal)} \u20AC`, y, 9, fontBold, darkGray);
    y -= 22;

    const cols = [margin + 6, margin + 200, margin + 270, margin + 340, margin + 420];
    text("Nome", cols[0], y, 7, fontBold, gray);
    text("Unidade", cols[1], y, 7, fontBold, gray);
    text("Qtd", cols[2], y, 7, fontBold, gray);
    text("P. Unit.", cols[3], y, 7, fontBold, gray);
    textRight("Total", y, 7, fontBold, gray);
    y -= 4; line(y); y -= 12;

    for (const item of catItems) {
      checkPage(16);
      const total = item.quantidade * item.preco_unitario;
      text(item.nome, cols[0], y, 8, font, darkGray);
      text(item.unidade, cols[1], y, 8, font, gray);
      text(String(item.quantidade), cols[2], y, 8, font, darkGray);
      text(`${fmt(item.preco_unitario)}`, cols[3], y, 8, font, darkGray);
      textRight(`${fmt(total)} \u20AC`, y, 8, font, darkGray);
      y -= 14;
    }
    y -= 8;
  }

  // Summary
  checkPage(180);
  y -= 10; line(y); y -= 20;

  const c = project.calc;
  text("RESUMO FINANCEIRO", margin, y, 11, fontBold, blue);
  y -= 24;

  const summaryRows: [string, string, boolean?][] = [
    ["Custo Direto", `${fmt(c.custo_direto)} \u20AC`],
    [`Overhead (${inp.overhead_pct}%)`, `${fmt(c.overhead_valor)} \u20AC`],
    [`Contingencia (${inp.contingencia_pct}%)`, `${fmt(c.contingencia_valor)} \u20AC`],
    ["Subtotal", `${fmt(c.subtotal_com_contingencia)} \u20AC`, true],
  ];

  for (const [label, value, bold] of summaryRows) {
    text(label, margin + 6, y, 9, bold ? fontBold : font, darkGray);
    textRight(value, y, 9, bold ? fontBold : font, darkGray);
    y -= 16;
  }

  y -= 4; line(y); y -= 20;

  page.drawRectangle({ x: margin, y: y - 6, width: contentW, height: 24, color: rgb(0.93, 0.96, 1) });
  text(`Preco Recomendado (margem ${inp.margem_alvo_pct}%)`, margin + 6, y, 10, fontBold, blue);
  textRight(`${fmt(c.preco_recomendado)} \u20AC`, y, 11, fontBold, blue);
  y -= 28;

  text(`Preco Minimo (margem ${inp.margem_minima_pct}%)`, margin + 6, y, 9, font, darkGray);
  textRight(`${fmt(c.preco_minimo)} \u20AC`, y, 9, fontBold, darkGray);
  y -= 30;

  // Notes
  if (inp.observacoes || inp.condicoes) {
    checkPage(60); line(y); y -= 20;
    if (inp.observacoes) {
      text("Observacoes", margin, y, 9, fontBold, gray); y -= 14;
      const words = inp.observacoes.split(" ");
      let currentLine = "";
      for (const word of words) {
        const test = currentLine ? `${currentLine} ${word}` : word;
        if (font.widthOfTextAtSize(test, 8) > contentW - 12) {
          checkPage(14); text(currentLine, margin + 6, y, 8, font, darkGray); y -= 12; currentLine = word;
        } else { currentLine = test; }
      }
      if (currentLine) { checkPage(14); text(currentLine, margin + 6, y, 8, font, darkGray); y -= 18; }
    }
    if (inp.condicoes) {
      checkPage(40); text("Condicoes", margin, y, 9, fontBold, gray); y -= 14;
      const words = inp.condicoes.split(" ");
      let currentLine = "";
      for (const word of words) {
        const test = currentLine ? `${currentLine} ${word}` : word;
        if (font.widthOfTextAtSize(test, 8) > contentW - 12) {
          checkPage(14); text(currentLine, margin + 6, y, 8, font, darkGray); y -= 12; currentLine = word;
        } else { currentLine = test; }
      }
      if (currentLine) { checkPage(14); text(currentLine, margin + 6, y, 8, font, darkGray); y -= 12; }
    }
  }

  // Footer
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const footerText = `Beyond Pricing -- Pagina ${i + 1} de ${pages.length}`;
    const fw = font.widthOfTextAtSize(footerText, 7);
    p.drawText(footerText, { x: (pageW - fw) / 2, y: 25, size: 7, font, color: gray });
  }

  return doc.save();
}
