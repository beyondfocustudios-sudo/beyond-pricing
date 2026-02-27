import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveAccessRole } from "@/lib/access-role";
import {
  disconnectCalendarIntegration,
  setPrimaryCalendar,
  syncAllConnectedProviders,
  syncCalendarProvider,
  type CalendarProvider,
} from "@/lib/calendar-sync";

type IntegrationRow = {
  id: string;
  provider: CalendarProvider;
  last_sync_at: string | null;
  last_sync_error: string | null;
  last_sync_status: string | null;
  created_at: string | null;
};

type CalendarMapRow = {
  integration_id: string;
  external_calendar_id: string;
  label: string;
  is_primary: boolean;
  last_sync_at: string | null;
};

type ProviderConfig = {
  ready: boolean;
  missing: string[];
};

function parseProvider(value: unknown): CalendarProvider | null {
  const provider = String(value ?? "").toLowerCase();
  if (provider === "google" || provider === "microsoft") return provider;
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
    return { error: NextResponse.json({ error: "Clientes não podem gerir integrações" }, { status: 403 }) };
  }

  return { sb, user };
}

export async function GET(request: NextRequest) {
  const access = await requireTeamUser();
  if ("error" in access) return access.error;

  const { sb, user } = access;
  const requestedProvider = parseProvider(request.nextUrl.searchParams.get("provider"));
  const providerList = requestedProvider ? [requestedProvider] : (["google", "microsoft"] as const);

  const { data: integrationRows } = await sb
    .from("calendar_integrations")
    .select("id, provider, last_sync_at, last_sync_error, last_sync_status, created_at")
    .eq("user_id", user.id)
    .in("provider", [...providerList])
    .order("provider", { ascending: true });

  const integrations = (integrationRows ?? []) as IntegrationRow[];
  const integrationByProvider = new Map(integrations.map((row) => [row.provider, row]));

  const integrationIds = integrations.map((row) => row.id);
  let calendarRows: CalendarMapRow[] = [];
  if (integrationIds.length > 0) {
    const { data } = await sb
      .from("external_calendar_maps")
      .select("integration_id, external_calendar_id, label, is_primary, last_sync_at")
      .in("integration_id", integrationIds)
      .order("label", { ascending: true });

    calendarRows = (data ?? []) as CalendarMapRow[];
  }

  const calendarsByIntegration = new Map<string, CalendarMapRow[]>();
  for (const row of calendarRows) {
    const list = calendarsByIntegration.get(row.integration_id) ?? [];
    list.push(row);
    calendarsByIntegration.set(row.integration_id, list);
  }

  const existingToken = await sb
    .from("calendar_feed_tokens")
    .select("token")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const feedToken = existingToken.data?.token ?? "";

  const baseUrl = request.nextUrl.origin;
  const providerConfig: Record<CalendarProvider, ProviderConfig> = {
    google: {
      ready: Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET),
      missing: [
        ...(!process.env.GOOGLE_CALENDAR_CLIENT_ID ? ["GOOGLE_CALENDAR_CLIENT_ID"] : []),
        ...(!process.env.GOOGLE_CALENDAR_CLIENT_SECRET ? ["GOOGLE_CALENDAR_CLIENT_SECRET"] : []),
      ],
    },
    microsoft: {
      ready: Boolean(process.env.MICROSOFT_CALENDAR_CLIENT_ID && process.env.MICROSOFT_CALENDAR_CLIENT_SECRET),
      missing: [
        ...(!process.env.MICROSOFT_CALENDAR_CLIENT_ID ? ["MICROSOFT_CALENDAR_CLIENT_ID"] : []),
        ...(!process.env.MICROSOFT_CALENDAR_CLIENT_SECRET ? ["MICROSOFT_CALENDAR_CLIENT_SECRET"] : []),
      ],
    },
  };

  const providers = providerList.map((provider) => {
    const integration = integrationByProvider.get(provider) ?? null;
    const calendars = integration ? (calendarsByIntegration.get(integration.id) ?? []) : [];
    const config = providerConfig[provider];

    return {
      provider,
      connected: Boolean(integration),
      configReady: config.ready,
      missingEnv: config.missing,
      connectUrl: `/api/integrations/${provider}/connect`,
      disconnectAction: "disconnect",
      syncAction: "sync",
      status: integration?.last_sync_status ?? "idle",
      lastSyncAt: integration?.last_sync_at ?? null,
      lastSyncError: integration?.last_sync_error ?? null,
      calendars: calendars.map((calendar) => ({
        id: calendar.external_calendar_id,
        label: calendar.label,
        isPrimary: calendar.is_primary,
        lastSyncAt: calendar.last_sync_at,
      })),
    };
  });

  return NextResponse.json({
    ok: true,
    providers,
    ics: {
      feedToken,
      hasToken: Boolean(feedToken),
      feedUrl: feedToken ? `${baseUrl}/api/calendar/feed.ics?token=${feedToken}` : null,
      downloadUrl: feedToken ? `/api/calendar/feed.ics?token=${feedToken}` : "/api/calendar/feed.ics",
    },
  });
}

export async function POST(request: NextRequest) {
  const access = await requireTeamUser();
  if ("error" in access) return access.error;

  const { sb, user } = access;

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action ?? "").toLowerCase();
  const provider = parseProvider(body.provider);

  try {
    if (action === "disconnect") {
      if (!provider) return NextResponse.json({ error: "provider obrigatório" }, { status: 400 });
      await disconnectCalendarIntegration(sb, { userId: user.id, provider });
      return NextResponse.json({ ok: true, disconnected: provider });
    }

    if (action === "set_primary") {
      if (!provider) return NextResponse.json({ error: "provider obrigatório" }, { status: 400 });
      const calendarId = String(body.calendarId ?? "");
      if (!calendarId) return NextResponse.json({ error: "calendarId obrigatório" }, { status: 400 });

      await setPrimaryCalendar(sb, {
        userId: user.id,
        provider,
        externalCalendarId: calendarId,
      });

      return NextResponse.json({ ok: true, provider, calendarId });
    }

    if (action === "sync") {
      if (provider) {
        const result = await syncCalendarProvider(sb, {
          provider,
          userId: user.id,
          mode: "full",
        });
        return NextResponse.json({ ok: true, result });
      }

      const results = await syncAllConnectedProviders(sb, user.id, "full");
      return NextResponse.json({ ok: true, results });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao executar ação" },
      { status: 500 },
    );
  }
}
