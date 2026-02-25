import { NextRequest, NextResponse } from "next/server";
import { recalculateInsightsSnapshot, requireInsightsAdmin } from "@/app/api/insights/_lib";

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
    const snapshot = await recalculateInsightsSnapshot();
    return NextResponse.json({
      ok: true,
      message: `Insights recalculados (${snapshot.activeProjects} projetos ativos).`,
      role: adminCtx.role,
      snapshot,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_AUTHENTICATED") {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Apenas owner/admin" }, { status: 403 });
    }
    const msg = error instanceof Error ? error.message : "Falha ao recalcular insights";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
