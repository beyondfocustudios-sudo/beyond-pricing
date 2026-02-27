import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveAccessRole } from "@/lib/access-role";
import { setPrimaryCalendar, type CalendarProvider } from "@/lib/calendar-sync";

function parseProvider(value: unknown): CalendarProvider | null {
  const provider = String(value ?? "").toLowerCase();
  if (provider === "google" || provider === "microsoft") return provider;
  return null;
}

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const access = await resolveAccessRole(sb, user);
  if (access.isClient) {
    return NextResponse.json({ error: "Clientes nao podem gerir integracoes" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const provider = parseProvider(body.provider);
  const calendarId = String(body.calendar_id ?? "");

  if (!provider) {
    return NextResponse.json({ error: "provider invalido" }, { status: 400 });
  }

  if (!calendarId) {
    return NextResponse.json({ error: "calendar_id obrigatorio" }, { status: 400 });
  }

  try {
    await setPrimaryCalendar(sb, {
      userId: user.id,
      provider,
      externalCalendarId: calendarId,
    });
    return NextResponse.json({ ok: true, provider, calendarId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao definir calendario principal" },
      { status: 500 },
    );
  }
}
