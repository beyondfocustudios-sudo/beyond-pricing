import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getAssistantSettings } from "@/lib/hq-assistant";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const settings = await getAssistantSettings(supabase);
  return NextResponse.json({
    enableCelebrations: settings.enableCelebrations,
    enableSmoothScroll: settings.enableSmoothScroll,
  });
}

