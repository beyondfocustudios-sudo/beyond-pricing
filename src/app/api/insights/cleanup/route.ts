import { NextRequest, NextResponse } from "next/server";
import { cleanupInsightCaches, requireInsightsAdmin } from "@/app/api/insights/_lib";

type Payload = { confirm?: boolean };

export async function POST(req: NextRequest) {
  let payload: Payload = {};
  try {
    payload = (await req.json()) as Payload;
  } catch {
    payload = {};
  }

  if (!payload.confirm) {
    return NextResponse.json({ error: "Confirmação obrigatória" }, { status: 400 });
  }

  try {
    const adminCtx = await requireInsightsAdmin();
    const cleanup = await cleanupInsightCaches();

    const tableSummary = cleanup.cleared.length > 0
      ? cleanup.cleared.map((item) => `${item.table}: ${item.rows}`).join(" · ")
      : "Sem tabelas de cache para limpar";

    return NextResponse.json({
      ok: true,
      message: `Limpeza concluída (${cleanup.totalRows} linhas). ${tableSummary}`,
      role: adminCtx.role,
      cleared: cleanup.totalRows,
      tables: cleanup.cleared,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_AUTHENTICATED") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Apenas owner/admin" }, { status: 403 });
    }
    const msg = error instanceof Error ? error.message : "Falha ao limpar cache";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
