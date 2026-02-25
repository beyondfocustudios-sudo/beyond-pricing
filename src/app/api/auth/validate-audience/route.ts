import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  decideAudienceAccess,
  parseAudience,
  resolveAudienceMembership,
} from "@/lib/login-audience";

export async function GET(request: NextRequest) {
  const audience = parseAudience(request.nextUrl.searchParams.get("audience"));
  if (!audience) {
    return NextResponse.json({ error: "audience inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const membership = await resolveAudienceMembership(supabase, user);
  const decision = decideAudienceAccess(audience, membership);

  if (!decision.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: decision.message,
        suggestedAudience: decision.suggestedAudience,
        suggestedPath: decision.suggestedPath,
      },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ok: true,
    audience,
    redirectPath: decision.suggestedPath,
  });
}
