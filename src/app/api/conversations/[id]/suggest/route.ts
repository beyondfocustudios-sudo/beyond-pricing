import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// POST /api/conversations/[id]/suggest — AI reply suggestion (stub)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void params;
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // TODO: integrate AI when API key is available
  return NextResponse.json({ suggestion: "" });
}
