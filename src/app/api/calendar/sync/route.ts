import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveAccessRole } from "@/lib/access-role";
import {
  syncAllConnectedProviders,
  syncCalendarProvider,
  type CalendarProvider,
} from "@/lib/calendar-sync";

function parseProvider(value: string | null): CalendarProvider | null {
  if (value === "google" || value === "microsoft") return value;
  return null;
}

async function requireTeamUser() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }

  const access = await resolveAccessRole(sb, user);
  if (access.isClient) {
    return { error: NextResponse.json({ error: "Clientes não podem sincronizar calendários externos" }, { status: 403 }) };
  }

  return { sb, user };
}

export async function GET(request: NextRequest) {
  const access = await requireTeamUser();
  if ("error" in access) return access.error;

  const { sb, user } = access;
  const provider = parseProvider(request.nextUrl.searchParams.get("provider"));

  try {
    if (provider) {
      const result = await syncCalendarProvider(sb, { provider, userId: user.id, mode: "full" });
      return NextResponse.json({ ok: true, result });
    }

    const results = await syncAllConnectedProviders(sb, user.id, "full");
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha no sync" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireTeamUser();
  if ("error" in access) return access.error;

  const { sb, user } = access;
  const body = await request.json().catch(() => ({} as { provider?: string }));
  const provider = parseProvider(body.provider ?? null);

  try {
    if (provider) {
      const result = await syncCalendarProvider(sb, { provider, userId: user.id, mode: "full" });
      return NextResponse.json({ ok: true, result });
    }

    const results = await syncAllConnectedProviders(sb, user.id, "full");
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha no sync" }, { status: 500 });
  }
}
