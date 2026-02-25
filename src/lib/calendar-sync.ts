import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";

export type CalendarProvider = "google" | "microsoft";

type DbIntegration = {
  id: string;
  user_id: string;
  provider: CalendarProvider;
  access_token: string | null;
  refresh_token: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  expires_at: string | null;
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
};

type DbCalendarMap = {
  id: string;
  integration_id: string;
  external_calendar_id: string;
  label: string;
  is_primary: boolean;
  last_sync_token: string | null;
  last_delta_link: string | null;
};

type DbEventMap = {
  id: string;
  event_id: string;
  integration_id: string;
  external_event_id: string;
  external_calendar_id: string | null;
  etag: string | null;
  source_hash: string | null;
  last_synced_at: string;
};

type InternalEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  type: "shoot" | "meeting" | "review" | "delivery" | "travel" | "other";
  status: "confirmed" | "tentative" | "cancelled";
  timezone: string;
  meeting_url: string | null;
  project_id: string | null;
  calendar_id: string | null;
  deleted_at: string | null;
  updated_at: string;
  external_source: string | null;
  external_calendar_id: string | null;
  external_event_id: string | null;
  external_etag: string | null;
};

type ParsedExternalEvent = {
  externalEventId: string;
  externalCalendarId: string;
  etag?: string | null;
  deleted: boolean;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  status: "confirmed" | "tentative" | "cancelled";
};

type SyncMode = "full" | "push";

export type SyncRunResult = {
  provider: CalendarProvider;
  pulled: number;
  pushed: number;
  deleted: number;
  skipped: number;
  errors: string[];
};

type OAuthTokenPayload = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: string | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
};

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function hashEvent(event: Pick<InternalEvent, "title" | "description" | "location" | "starts_at" | "ends_at" | "all_day" | "status" | "timezone" | "meeting_url" | "type" | "deleted_at">) {
  const raw = JSON.stringify({
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    allDay: event.all_day,
    status: event.status,
    timezone: event.timezone,
    meetingUrl: event.meeting_url ?? "",
    type: event.type,
    deleted: Boolean(event.deleted_at),
  });

  return createHash("sha256").update(raw).digest("hex");
}

function parseDateOrNull(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeAllDayRange(startDate: string, endDate: string | null) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const endSource = endDate ? new Date(`${endDate}T00:00:00.000Z`) : new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const end = new Date(endSource.getTime() - 60 * 1000);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function toDateOnlyUtc(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function plusOneDayDateOnly(dateOnly: string) {
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getIntegrationToken(row: DbIntegration, field: "access" | "refresh") {
  if (field === "access") {
    if (row.access_token_enc) {
      try {
        return decrypt(row.access_token_enc);
      } catch {
        // Fallback for legacy clear-text rows.
      }
    }
    return row.access_token;
  }

  if (row.refresh_token_enc) {
    try {
      return decrypt(row.refresh_token_enc);
    } catch {
      // Fallback for legacy clear-text rows.
    }
  }
  return row.refresh_token;
}

async function setIntegrationSyncState(
  sb: SupabaseClient,
  integrationId: string,
  state: { status: "running" | "success" | "error"; error?: string | null },
) {
  const patch: Record<string, unknown> = {
    last_sync_status: state.status,
  };

  if (state.status === "success") {
    patch.last_sync_at = nowIso();
    patch.last_sync_error = null;
  } else if (state.status === "error") {
    patch.last_sync_error = state.error ?? "Sync failed";
  }

  await sb.from("calendar_integrations").update(patch).eq("id", integrationId);
}

async function getIntegration(
  sb: SupabaseClient,
  userId: string,
  provider: CalendarProvider,
): Promise<DbIntegration | null> {
  const { data } = await sb
    .from("calendar_integrations")
    .select("id, user_id, provider, access_token, refresh_token, access_token_enc, refresh_token_enc, expires_at, scopes, metadata")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  return (data as DbIntegration | null) ?? null;
}

export async function upsertCalendarIntegration(
  sb: SupabaseClient,
  params: {
    userId: string;
    orgId?: string | null;
    provider: CalendarProvider;
    token: OAuthTokenPayload;
  },
) {
  const payload: Record<string, unknown> = {
    user_id: params.userId,
    org_id: params.orgId ?? null,
    provider: params.provider,
    access_token_enc: encrypt(params.token.accessToken),
    refresh_token_enc: params.token.refreshToken ? encrypt(params.token.refreshToken) : null,
    expires_at: params.token.expiresAt,
    scopes: params.token.scopes ?? [],
    metadata: params.token.metadata ?? {},
    last_sync_status: "idle",
    last_sync_error: null,
  };

  const { data, error } = await sb
    .from("calendar_integrations")
    .upsert(payload, { onConflict: "user_id,provider" })
    .select("id, provider")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Falha ao guardar integração");
  }

  return data as { id: string; provider: CalendarProvider };
}

async function refreshGoogleToken(sb: SupabaseClient, integration: DbIntegration) {
  const refreshToken = getIntegrationToken(integration, "refresh");
  if (!refreshToken) throw new Error("Missing Google refresh token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: env("GOOGLE_CALENDAR_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  const payload = await response.json().catch(() => ({} as { error_description?: string }));
  if (!response.ok) {
    throw new Error(payload?.error_description ?? "Google token refresh failed");
  }

  const accessToken = String((payload as { access_token?: string }).access_token ?? "");
  const expiresIn = Number((payload as { expires_in?: number }).expires_in ?? 3600);
  const nextExpiresAt = new Date(Date.now() + expiresIn * 1000 - 60_000).toISOString();

  await sb
    .from("calendar_integrations")
    .update({
      access_token_enc: encrypt(accessToken),
      expires_at: nextExpiresAt,
      access_token: null,
    })
    .eq("id", integration.id);

  return accessToken;
}

async function refreshMicrosoftToken(sb: SupabaseClient, integration: DbIntegration) {
  const refreshToken = getIntegrationToken(integration, "refresh");
  if (!refreshToken) throw new Error("Missing Microsoft refresh token");

  const tenant = process.env.MICROSOFT_CALENDAR_TENANT_ID || "common";
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("MICROSOFT_CALENDAR_CLIENT_ID"),
      client_secret: env("MICROSOFT_CALENDAR_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "offline_access Calendars.ReadWrite",
    }).toString(),
  });

  const payload = await response.json().catch(() => ({} as { error_description?: string }));
  if (!response.ok) {
    throw new Error(payload?.error_description ?? "Microsoft token refresh failed");
  }

  const accessToken = String((payload as { access_token?: string }).access_token ?? "");
  const nextRefresh = (payload as { refresh_token?: string }).refresh_token || refreshToken;
  const expiresIn = Number((payload as { expires_in?: number }).expires_in ?? 3600);
  const nextExpiresAt = new Date(Date.now() + expiresIn * 1000 - 60_000).toISOString();

  await sb
    .from("calendar_integrations")
    .update({
      access_token_enc: encrypt(accessToken),
      refresh_token_enc: encrypt(nextRefresh),
      expires_at: nextExpiresAt,
      access_token: null,
      refresh_token: null,
    })
    .eq("id", integration.id);

  return accessToken;
}

async function providerFetch(
  sb: SupabaseClient,
  integration: DbIntegration,
  url: string,
  init: RequestInit,
) {
  let accessToken = getIntegrationToken(integration, "access");

  const expired = integration.expires_at ? new Date(integration.expires_at).getTime() <= Date.now() + 30_000 : false;
  if (!accessToken || expired) {
    accessToken = integration.provider === "google"
      ? await refreshGoogleToken(sb, integration)
      : await refreshMicrosoftToken(sb, integration);
  }

  const request = async (token: string) => {
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, { ...init, headers });
  };

  let response = await request(accessToken);
  if (response.status === 401) {
    accessToken = integration.provider === "google"
      ? await refreshGoogleToken(sb, integration)
      : await refreshMicrosoftToken(sb, integration);
    response = await request(accessToken);
  }

  return response;
}

export async function listGoogleCalendars(sb: SupabaseClient, integration: DbIntegration) {
  const response = await providerFetch(
    sb,
    integration,
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer",
    { method: "GET" },
  );

  const payload = await response.json().catch(() => ({} as { items?: Array<Record<string, unknown>> }));
  if (!response.ok) {
    throw new Error("Falha ao listar calendários Google");
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.map((item: Record<string, unknown>) => ({
    externalCalendarId: String(item.id ?? ""),
    label: String(item.summary ?? "Google Calendar"),
    isPrimary: Boolean(item.primary),
  })).filter((item: { externalCalendarId: string }) => item.externalCalendarId);
}

export async function listMicrosoftCalendars(sb: SupabaseClient, integration: DbIntegration) {
  const response = await providerFetch(
    sb,
    integration,
    "https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,isDefaultCalendar,canEdit",
    { method: "GET" },
  );

  const payload = await response.json().catch(() => ({} as { value?: Array<Record<string, unknown>> }));
  if (!response.ok) {
    throw new Error("Falha ao listar calendários Microsoft");
  }

  const rows = Array.isArray(payload.value) ? payload.value : [];
  return rows
    .filter((item: Record<string, unknown>) => item.canEdit !== false)
    .map((item: Record<string, unknown>) => ({
      externalCalendarId: String(item.id ?? ""),
      label: String(item.name ?? "Outlook Calendar"),
      isPrimary: Boolean(item.isDefaultCalendar),
    }))
    .filter((item: { externalCalendarId: string }) => item.externalCalendarId);
}

export async function upsertExternalCalendars(
  sb: SupabaseClient,
  integrationId: string,
  calendars: Array<{ externalCalendarId: string; label: string; isPrimary: boolean }>,
) {
  if (calendars.length === 0) return;

  const { data: existing } = await sb
    .from("external_calendar_maps")
    .select("id, external_calendar_id, is_primary")
    .eq("integration_id", integrationId);

  const existingRows = (existing ?? []) as Array<{ id: string; external_calendar_id: string; is_primary: boolean }>;
  const existingPrimary = existingRows.find((row) => row.is_primary)?.external_calendar_id ?? null;
  const incomingPrimary = calendars.find((row) => row.isPrimary)?.externalCalendarId ?? existingPrimary ?? calendars[0].externalCalendarId;

  const payload = calendars.map((calendar) => ({
    integration_id: integrationId,
    external_calendar_id: calendar.externalCalendarId,
    label: calendar.label,
    is_primary: calendar.externalCalendarId === incomingPrimary,
  }));

  const { error } = await sb
    .from("external_calendar_maps")
    .upsert(payload, { onConflict: "integration_id,external_calendar_id" });

  if (error) {
    throw new Error(error.message);
  }
}

function toInternalEventFromGoogle(item: Record<string, unknown>, externalCalendarId: string): ParsedExternalEvent | null {
  const externalEventId = String(item.id ?? "");
  if (!externalEventId) return null;

  const status = String(item.status ?? "confirmed").toLowerCase();
  const deleted = status === "cancelled";

  const startObj = (item.start ?? {}) as Record<string, unknown>;
  const endObj = (item.end ?? {}) as Record<string, unknown>;

  const allDay = typeof startObj.date === "string";

  let startsAt = "";
  let endsAt = "";
  if (allDay) {
    const normalized = normalizeAllDayRange(String(startObj.date), typeof endObj.date === "string" ? endObj.date : null);
    startsAt = normalized.startIso;
    endsAt = normalized.endIso;
  } else {
    const start = parseDateOrNull(String(startObj.dateTime ?? ""));
    const end = parseDateOrNull(String(endObj.dateTime ?? ""));
    if (!start || !end) return null;
    startsAt = start.toISOString();
    endsAt = end.toISOString();
  }

  return {
    externalEventId,
    externalCalendarId,
    etag: typeof item.etag === "string" ? item.etag : null,
    deleted,
    title: String(item.summary ?? "Evento"),
    description: typeof item.description === "string" ? item.description : null,
    location: typeof item.location === "string" ? item.location : null,
    startsAt,
    endsAt,
    allDay,
    timezone: String(startObj.timeZone ?? endObj.timeZone ?? "Europe/Lisbon"),
    status: deleted ? "cancelled" : "confirmed",
  };
}

function parseMicrosoftDate(dateTime: string | null | undefined) {
  if (!dateTime) return null;
  const direct = parseDateOrNull(dateTime);
  if (direct) return direct;
  return parseDateOrNull(`${dateTime}Z`);
}

function toInternalEventFromMicrosoft(item: Record<string, unknown>, externalCalendarId: string): ParsedExternalEvent | null {
  const externalEventId = String(item.id ?? "");
  if (!externalEventId) return null;

  const removed = item["@removed"] !== undefined;
  const isCancelled = Boolean(item.isCancelled);
  const deleted = removed || isCancelled;

  const allDay = Boolean(item.isAllDay);

  const startObj = (item.start ?? {}) as Record<string, unknown>;
  const endObj = (item.end ?? {}) as Record<string, unknown>;

  let startsAt = "";
  let endsAt = "";

  if (allDay) {
    const startDate = String(startObj.dateTime ?? "").slice(0, 10);
    const endDate = String(endObj.dateTime ?? "").slice(0, 10) || plusOneDayDateOnly(startDate);
    if (!startDate) return null;
    const normalized = normalizeAllDayRange(startDate, endDate);
    startsAt = normalized.startIso;
    endsAt = normalized.endIso;
  } else {
    const start = parseMicrosoftDate(typeof startObj.dateTime === "string" ? startObj.dateTime : null);
    const end = parseMicrosoftDate(typeof endObj.dateTime === "string" ? endObj.dateTime : null);
    if (!start || !end) return null;
    startsAt = start.toISOString();
    endsAt = end.toISOString();
  }

  return {
    externalEventId,
    externalCalendarId,
    etag: typeof item["@odata.etag"] === "string" ? String(item["@odata.etag"]) : null,
    deleted,
    title: String(item.subject ?? "Evento"),
    description: typeof item.bodyPreview === "string" ? item.bodyPreview : null,
    location: typeof (item.location as Record<string, unknown> | undefined)?.displayName === "string"
      ? String((item.location as Record<string, unknown>).displayName)
      : null,
    startsAt,
    endsAt,
    allDay,
    timezone: String(startObj.timeZone ?? endObj.timeZone ?? "Europe/Lisbon"),
    status: deleted ? "cancelled" : "confirmed",
  };
}

async function upsertPulledEvent(
  sb: SupabaseClient,
  params: {
    provider: CalendarProvider;
    userId: string;
    integrationId: string;
    eventMapsByExternalId: Map<string, DbEventMap>;
    parsed: ParsedExternalEvent;
  },
) {
  const { parsed } = params;
  const existingMap = params.eventMapsByExternalId.get(parsed.externalEventId);

  if (parsed.deleted) {
    if (existingMap) {
      await sb
        .from("calendar_events")
        .update({
          deleted_at: nowIso(),
          external_source: params.provider,
          external_calendar_id: parsed.externalCalendarId,
          external_event_id: parsed.externalEventId,
          external_etag: parsed.etag ?? null,
        })
        .eq("id", existingMap.event_id)
        .eq("user_id", params.userId)
        .is("deleted_at", null);

      await sb
        .from("external_event_maps")
        .update({
          etag: parsed.etag ?? null,
          last_synced_at: nowIso(),
          source_hash: null,
        })
        .eq("id", existingMap.id);
    }
    return "deleted" as const;
  }

  const payload = {
    title: parsed.title,
    description: parsed.description,
    location: parsed.location,
    starts_at: parsed.startsAt,
    ends_at: parsed.endsAt,
    all_day: parsed.allDay,
    timezone: parsed.timezone || "Europe/Lisbon",
    status: parsed.status,
    external_source: params.provider,
    external_calendar_id: parsed.externalCalendarId,
    external_event_id: parsed.externalEventId,
    external_etag: parsed.etag ?? null,
    deleted_at: null,
  };

  if (existingMap) {
    const { data: currentEvent } = await sb
      .from("calendar_events")
      .select("id, title, description, location, starts_at, ends_at, all_day, status, timezone, meeting_url, type, deleted_at")
      .eq("id", existingMap.event_id)
      .eq("user_id", params.userId)
      .maybeSingle();

    if (!currentEvent) return "skipped" as const;

    const nextHash = hashEvent({
      title: payload.title,
      description: payload.description,
      location: payload.location,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at,
      all_day: payload.all_day,
      status: payload.status,
      timezone: payload.timezone,
      meeting_url: currentEvent.meeting_url,
      type: (currentEvent.type as InternalEvent["type"]) ?? "other",
      deleted_at: null,
    });

    if (existingMap.source_hash && existingMap.source_hash === nextHash && existingMap.etag === (parsed.etag ?? null)) {
      await sb
        .from("external_event_maps")
        .update({ last_synced_at: nowIso() })
        .eq("id", existingMap.id);
      return "skipped" as const;
    }

    await sb
      .from("calendar_events")
      .update(payload)
      .eq("id", existingMap.event_id)
      .eq("user_id", params.userId);

    await sb
      .from("external_event_maps")
      .update({
        etag: parsed.etag ?? null,
        source_hash: nextHash,
        last_synced_at: nowIso(),
      })
      .eq("id", existingMap.id);

    return "updated" as const;
  }

  const { data: inserted, error } = await sb
    .from("calendar_events")
    .insert({
      user_id: params.userId,
      created_by: params.userId,
      title: payload.title,
      description: payload.description,
      location: payload.location,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at,
      all_day: payload.all_day,
      timezone: payload.timezone,
      status: payload.status,
      type: "other",
      external_source: params.provider,
      external_calendar_id: payload.external_calendar_id,
      external_event_id: payload.external_event_id,
      external_etag: payload.external_etag,
      deleted_at: null,
    })
    .select("id, title, description, location, starts_at, ends_at, all_day, status, timezone, meeting_url, type, deleted_at")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message ?? "Falha ao inserir evento externo");
  }

  const sourceHash = hashEvent({
    title: inserted.title,
    description: inserted.description,
    location: inserted.location,
    starts_at: inserted.starts_at,
    ends_at: inserted.ends_at,
    all_day: inserted.all_day,
    status: inserted.status,
    timezone: inserted.timezone,
    meeting_url: inserted.meeting_url,
    type: inserted.type,
    deleted_at: inserted.deleted_at,
  });

  const { data: newMap } = await sb
    .from("external_event_maps")
    .insert({
      integration_id: params.integrationId,
      event_id: inserted.id,
      external_event_id: parsed.externalEventId,
      external_calendar_id: parsed.externalCalendarId,
      etag: parsed.etag ?? null,
      source_hash: sourceHash,
      last_synced_at: nowIso(),
    })
    .select("id, event_id, integration_id, external_event_id, external_calendar_id, etag, source_hash, last_synced_at")
    .single();

  if (newMap) {
    params.eventMapsByExternalId.set(parsed.externalEventId, newMap as DbEventMap);
  }

  return "inserted" as const;
}

async function pullGoogleCalendar(
  sb: SupabaseClient,
  params: {
    integration: DbIntegration;
    calendarMap: DbCalendarMap;
    eventMapsByExternalId: Map<string, DbEventMap>;
    userId: string;
    stats: SyncRunResult;
  },
) {
  let pageToken: string | null = null;
  let syncToken = params.calendarMap.last_sync_token;
  let receivedSyncToken: string | null = null;

  const run = async (initialSyncToken: string | null) => {
    pageToken = null;
    receivedSyncToken = null;

    do {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(params.calendarMap.external_calendar_id)}/events`);
      url.searchParams.set("singleEvents", "false");
      url.searchParams.set("showDeleted", "true");
      url.searchParams.set("maxResults", "250");

      if (initialSyncToken) {
        url.searchParams.set("syncToken", initialSyncToken);
      } else {
        url.searchParams.set("timeMin", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString());
      }

      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await providerFetch(sb, params.integration, url.toString(), { method: "GET" });

      if (!response.ok) {
        if (response.status === 410 && initialSyncToken) {
          return "reset" as const;
        }
        throw new Error(`Google sync failed (${response.status})`);
      }

      const payload = await response.json().catch(() => ({} as { items?: Array<Record<string, unknown>>; nextPageToken?: string; nextSyncToken?: string }));
      const items = Array.isArray(payload.items) ? payload.items : [];

      for (const item of items) {
        const parsed = toInternalEventFromGoogle(item, params.calendarMap.external_calendar_id);
        if (!parsed) continue;
        const action = await upsertPulledEvent(sb, {
          provider: "google",
          userId: params.userId,
          integrationId: params.integration.id,
          eventMapsByExternalId: params.eventMapsByExternalId,
          parsed,
        });
        if (action === "inserted" || action === "updated") params.stats.pulled += 1;
        else if (action === "deleted") params.stats.deleted += 1;
        else params.stats.skipped += 1;
      }

      pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : null;
      if (!pageToken && typeof payload.nextSyncToken === "string") {
        receivedSyncToken = payload.nextSyncToken;
      }
    } while (pageToken);

    return "ok" as const;
  };

  const firstRun = await run(syncToken);
  if (firstRun === "reset") {
    syncToken = null;
    await run(null);
  }

  await sb
    .from("external_calendar_maps")
    .update({
      last_sync_token: receivedSyncToken ?? syncToken,
      last_sync_at: nowIso(),
      last_sync_error: null,
    })
    .eq("id", params.calendarMap.id);
}

async function pullMicrosoftCalendar(
  sb: SupabaseClient,
  params: {
    integration: DbIntegration;
    calendarMap: DbCalendarMap;
    eventMapsByExternalId: Map<string, DbEventMap>;
    userId: string;
    stats: SyncRunResult;
  },
) {
  let nextLink: string | null = params.calendarMap.last_delta_link;
  let deltaLink: string | null = null;

  if (!nextLink) {
    nextLink = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(params.calendarMap.external_calendar_id)}/events/delta?$top=100`;
  }

  while (nextLink) {
    const response = await providerFetch(sb, params.integration, nextLink, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Microsoft sync failed (${response.status})`);
    }

    const payload = await response.json().catch(() => ({} as { value?: Array<Record<string, unknown>>; "@odata.nextLink"?: string; "@odata.deltaLink"?: string }));
    const items = Array.isArray(payload.value) ? payload.value : [];

    for (const item of items) {
      const parsed = toInternalEventFromMicrosoft(item, params.calendarMap.external_calendar_id);
      if (!parsed) continue;
      const action = await upsertPulledEvent(sb, {
        provider: "microsoft",
        userId: params.userId,
        integrationId: params.integration.id,
        eventMapsByExternalId: params.eventMapsByExternalId,
        parsed,
      });
      if (action === "inserted" || action === "updated") params.stats.pulled += 1;
      else if (action === "deleted") params.stats.deleted += 1;
      else params.stats.skipped += 1;
    }

    nextLink = typeof payload["@odata.nextLink"] === "string" ? payload["@odata.nextLink"] : null;
    if (!nextLink && typeof payload["@odata.deltaLink"] === "string") {
      deltaLink = payload["@odata.deltaLink"];
    }
  }

  await sb
    .from("external_calendar_maps")
    .update({
      last_delta_link: deltaLink,
      last_sync_at: nowIso(),
      last_sync_error: null,
    })
    .eq("id", params.calendarMap.id);
}

function toGoogleEventPayload(event: InternalEvent, sourceHash: string) {
  const payload: Record<string, unknown> = {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    status: event.status === "cancelled" ? "cancelled" : "confirmed",
    extendedProperties: {
      private: {
        bp_origin: "platform",
        bp_event_id: event.id,
        bp_hash: sourceHash,
      },
    },
  };

  if (event.all_day) {
    const startDate = toDateOnlyUtc(event.starts_at);
    payload.start = { date: startDate };
    payload.end = { date: plusOneDayDateOnly(startDate) };
  } else {
    payload.start = {
      dateTime: new Date(event.starts_at).toISOString(),
      timeZone: event.timezone || "Europe/Lisbon",
    };
    payload.end = {
      dateTime: new Date(event.ends_at).toISOString(),
      timeZone: event.timezone || "Europe/Lisbon",
    };
  }

  return payload;
}

function toMicrosoftEventPayload(event: InternalEvent) {
  const payload: Record<string, unknown> = {
    subject: event.title,
    body: {
      contentType: "text",
      content: event.description ?? "",
    },
    location: event.location ? { displayName: event.location } : undefined,
    isAllDay: event.all_day,
  };

  if (event.all_day) {
    const start = toDateOnlyUtc(event.starts_at);
    const end = plusOneDayDateOnly(start);
    payload.start = { dateTime: `${start}T00:00:00`, timeZone: event.timezone || "Europe/Lisbon" };
    payload.end = { dateTime: `${end}T00:00:00`, timeZone: event.timezone || "Europe/Lisbon" };
  } else {
    payload.start = { dateTime: new Date(event.starts_at).toISOString(), timeZone: "UTC" };
    payload.end = { dateTime: new Date(event.ends_at).toISOString(), timeZone: "UTC" };
  }

  return payload;
}

async function pushGoogleEvent(
  sb: SupabaseClient,
  params: {
    integration: DbIntegration;
    event: InternalEvent;
    map: DbEventMap | null;
    externalCalendarId: string;
    sourceHash: string;
  },
) {
  const payload = toGoogleEventPayload(params.event, params.sourceHash);

  if (!params.map) {
    const response = await providerFetch(
      sb,
      params.integration,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(params.externalCalendarId)}/events`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const data = await response.json().catch(() => ({} as { id?: string; etag?: string }));
    if (!response.ok || !data.id) {
      throw new Error("Google create event failed");
    }

    return {
      externalEventId: String(data.id),
      etag: typeof data.etag === "string" ? data.etag : null,
      externalCalendarId: params.externalCalendarId,
    };
  }

  const response = await providerFetch(
    sb,
    params.integration,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(params.externalCalendarId)}/events/${encodeURIComponent(params.map.external_event_id)}`,
    {
      method: "PATCH",
      headers: params.map.etag ? { "If-Match": params.map.etag } : undefined,
      body: JSON.stringify(payload),
    },
  );

  if (response.status === 404) {
    return pushGoogleEvent(sb, {
      integration: params.integration,
      event: params.event,
      map: null,
      externalCalendarId: params.externalCalendarId,
      sourceHash: params.sourceHash,
    });
  }

  const data = await response.json().catch(() => ({} as { etag?: string }));
  if (!response.ok) {
    throw new Error("Google update event failed");
  }

  return {
    externalEventId: params.map.external_event_id,
    etag: typeof data.etag === "string" ? data.etag : params.map.etag,
    externalCalendarId: params.externalCalendarId,
  };
}

async function deleteGoogleEvent(
  sb: SupabaseClient,
  params: {
    integration: DbIntegration;
    externalCalendarId: string;
    externalEventId: string;
  },
) {
  const response = await providerFetch(
    sb,
    params.integration,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(params.externalCalendarId)}/events/${encodeURIComponent(params.externalEventId)}`,
    {
      method: "DELETE",
    },
  );

  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) {
    throw new Error("Google delete event failed");
  }
}

async function pushMicrosoftEvent(
  sb: SupabaseClient,
  params: {
    integration: DbIntegration;
    event: InternalEvent;
    map: DbEventMap | null;
    externalCalendarId: string;
  },
) {
  const payload = toMicrosoftEventPayload(params.event);

  if (!params.map) {
    const response = await providerFetch(
      sb,
      params.integration,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(params.externalCalendarId)}/events`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const data = await response.json().catch(() => ({} as { id?: string; "@odata.etag"?: string }));
    if (!response.ok || !data.id) {
      throw new Error("Microsoft create event failed");
    }

    return {
      externalEventId: String(data.id),
      etag: typeof data["@odata.etag"] === "string" ? data["@odata.etag"] : null,
      externalCalendarId: params.externalCalendarId,
    };
  }

  const response = await providerFetch(
    sb,
    params.integration,
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(params.externalCalendarId)}/events/${encodeURIComponent(params.map.external_event_id)}`,
    {
      method: "PATCH",
      headers: params.map.etag ? { "If-Match": params.map.etag } : undefined,
      body: JSON.stringify(payload),
    },
  );

  if (response.status === 404) {
    return pushMicrosoftEvent(sb, {
      integration: params.integration,
      event: params.event,
      map: null,
      externalCalendarId: params.externalCalendarId,
    });
  }

  if (!response.ok) {
    throw new Error("Microsoft update event failed");
  }

  return {
    externalEventId: params.map.external_event_id,
    etag: (response.headers.get("ETag") ?? response.headers.get("etag")) || params.map.etag,
    externalCalendarId: params.externalCalendarId,
  };
}

async function deleteMicrosoftEvent(
  sb: SupabaseClient,
  params: {
    integration: DbIntegration;
    externalCalendarId: string;
    externalEventId: string;
  },
) {
  const response = await providerFetch(
    sb,
    params.integration,
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(params.externalCalendarId)}/events/${encodeURIComponent(params.externalEventId)}`,
    {
      method: "DELETE",
    },
  );

  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) {
    throw new Error("Microsoft delete event failed");
  }
}

async function pushInternalEvents(
  sb: SupabaseClient,
  params: {
    provider: CalendarProvider;
    integration: DbIntegration;
    userId: string;
    primaryCalendarId: string;
    eventMapsByEventId: Map<string, DbEventMap>;
    stats: SyncRunResult;
  },
) {
  const { data: localEvents } = await sb
    .from("calendar_events")
    .select("id, user_id, title, description, location, starts_at, ends_at, all_day, type, status, timezone, meeting_url, project_id, calendar_id, deleted_at, updated_at, external_source, external_calendar_id, external_event_id, external_etag")
    .eq("user_id", params.userId)
    .order("updated_at", { ascending: false })
    .limit(1200);

  for (const row of (localEvents ?? []) as InternalEvent[]) {
    const map = params.eventMapsByEventId.get(row.id) ?? null;
    const externalCalendarId = map?.external_calendar_id ?? row.external_calendar_id ?? params.primaryCalendarId;

    if (!externalCalendarId) {
      params.stats.skipped += 1;
      continue;
    }

    const sourceHash = hashEvent(row);

    if (row.deleted_at) {
      if (!map) {
        params.stats.skipped += 1;
        continue;
      }

      try {
        if (params.provider === "google") {
          await deleteGoogleEvent(sb, {
            integration: params.integration,
            externalCalendarId,
            externalEventId: map.external_event_id,
          });
        } else {
          await deleteMicrosoftEvent(sb, {
            integration: params.integration,
            externalCalendarId,
            externalEventId: map.external_event_id,
          });
        }

        await sb
          .from("external_event_maps")
          .update({
            source_hash: sourceHash,
            last_synced_at: nowIso(),
          })
          .eq("id", map.id);

        params.stats.deleted += 1;
      } catch (error) {
        params.stats.errors.push(error instanceof Error ? error.message : "Delete push failed");
      }
      continue;
    }

    if (map?.source_hash && map.source_hash === sourceHash) {
      params.stats.skipped += 1;
      continue;
    }

    try {
      const pushed = params.provider === "google"
        ? await pushGoogleEvent(sb, {
          integration: params.integration,
          event: row,
          map,
          externalCalendarId,
          sourceHash,
        })
        : await pushMicrosoftEvent(sb, {
          integration: params.integration,
          event: row,
          map,
          externalCalendarId,
        });

      if (map) {
        await sb
          .from("external_event_maps")
          .update({
            external_event_id: pushed.externalEventId,
            external_calendar_id: pushed.externalCalendarId,
            etag: pushed.etag,
            source_hash: sourceHash,
            last_synced_at: nowIso(),
          })
          .eq("id", map.id);
      } else {
        const { data: insertedMap } = await sb
          .from("external_event_maps")
          .insert({
            integration_id: params.integration.id,
            event_id: row.id,
            external_event_id: pushed.externalEventId,
            external_calendar_id: pushed.externalCalendarId,
            etag: pushed.etag,
            source_hash: sourceHash,
            last_synced_at: nowIso(),
          })
          .select("id, event_id, integration_id, external_event_id, external_calendar_id, etag, source_hash, last_synced_at")
          .single();

        if (insertedMap) {
          params.eventMapsByEventId.set(row.id, insertedMap as DbEventMap);
        }
      }

      await sb
        .from("calendar_events")
        .update({
          external_source: params.provider,
          external_calendar_id: pushed.externalCalendarId,
          external_event_id: pushed.externalEventId,
          external_etag: pushed.etag,
        })
        .eq("id", row.id)
        .eq("user_id", params.userId);

      params.stats.pushed += 1;
    } catch (error) {
      params.stats.errors.push(error instanceof Error ? error.message : "Push failed");
    }
  }
}

export async function syncCalendarProvider(
  sb: SupabaseClient,
  params: {
    provider: CalendarProvider;
    userId: string;
    mode?: SyncMode;
  },
): Promise<SyncRunResult> {
  const mode = params.mode ?? "full";
  const result: SyncRunResult = {
    provider: params.provider,
    pulled: 0,
    pushed: 0,
    deleted: 0,
    skipped: 0,
    errors: [],
  };

  const integration = await getIntegration(sb, params.userId, params.provider);
  if (!integration) {
    throw new Error(`Integração ${params.provider} não ligada`);
  }

  await setIntegrationSyncState(sb, integration.id, { status: "running" });

  try {
    const { data: calendarMapsData } = await sb
      .from("external_calendar_maps")
      .select("id, integration_id, external_calendar_id, label, is_primary, last_sync_token, last_delta_link")
      .eq("integration_id", integration.id)
      .order("created_at", { ascending: true });

    let calendarMaps = (calendarMapsData ?? []) as DbCalendarMap[];

    if (calendarMaps.length === 0) {
      const calendars = params.provider === "google"
        ? await listGoogleCalendars(sb, integration)
        : await listMicrosoftCalendars(sb, integration);
      await upsertExternalCalendars(sb, integration.id, calendars);

      const refreshed = await sb
        .from("external_calendar_maps")
        .select("id, integration_id, external_calendar_id, label, is_primary, last_sync_token, last_delta_link")
        .eq("integration_id", integration.id)
        .order("created_at", { ascending: true });
      calendarMaps = (refreshed.data ?? []) as DbCalendarMap[];
    }

    const primary = calendarMaps.find((row) => row.is_primary) ?? calendarMaps[0];
    if (!primary) {
      throw new Error("Sem calendário externo configurado");
    }

    const { data: mapRows } = await sb
      .from("external_event_maps")
      .select("id, event_id, integration_id, external_event_id, external_calendar_id, etag, source_hash, last_synced_at")
      .eq("integration_id", integration.id);

    const eventMaps = (mapRows ?? []) as DbEventMap[];
    const mapsByExternalId = new Map<string, DbEventMap>();
    const mapsByEventId = new Map<string, DbEventMap>();
    for (const row of eventMaps) {
      mapsByExternalId.set(row.external_event_id, row);
      mapsByEventId.set(row.event_id, row);
    }

    if (mode !== "push") {
      for (const calendarMap of calendarMaps) {
        if (params.provider === "google") {
          await pullGoogleCalendar(sb, {
            integration,
            calendarMap,
            eventMapsByExternalId: mapsByExternalId,
            userId: params.userId,
            stats: result,
          });
        } else {
          await pullMicrosoftCalendar(sb, {
            integration,
            calendarMap,
            eventMapsByExternalId: mapsByExternalId,
            userId: params.userId,
            stats: result,
          });
        }
      }
    }

    await pushInternalEvents(sb, {
      provider: params.provider,
      integration,
      userId: params.userId,
      primaryCalendarId: primary.external_calendar_id,
      eventMapsByEventId: mapsByEventId,
      stats: result,
    });

    await setIntegrationSyncState(sb, integration.id, { status: "success" });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calendar sync failed";
    await setIntegrationSyncState(sb, integration.id, { status: "error", error: message });
    throw error;
  }
}

export async function syncAllConnectedProviders(
  sb: SupabaseClient,
  userId: string,
  mode: SyncMode = "full",
) {
  const { data: providers } = await sb
    .from("calendar_integrations")
    .select("provider")
    .eq("user_id", userId)
    .in("provider", ["google", "microsoft"]);

  const rows = (providers ?? []) as Array<{ provider: CalendarProvider }>;
  const results: SyncRunResult[] = [];

  for (const row of rows) {
    try {
      const run = await syncCalendarProvider(sb, {
        provider: row.provider,
        userId,
        mode,
      });
      results.push(run);
    } catch (error) {
      results.push({
        provider: row.provider,
        pulled: 0,
        pushed: 0,
        deleted: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : "Sync failed"],
      });
    }
  }

  return results;
}

export async function setPrimaryCalendar(
  sb: SupabaseClient,
  params: {
    userId: string;
    provider: CalendarProvider;
    externalCalendarId: string;
  },
) {
  const integration = await getIntegration(sb, params.userId, params.provider);
  if (!integration) throw new Error("Integração não encontrada");

  await sb
    .from("external_calendar_maps")
    .update({ is_primary: false })
    .eq("integration_id", integration.id);

  const { data, error } = await sb
    .from("external_calendar_maps")
    .update({ is_primary: true })
    .eq("integration_id", integration.id)
    .eq("external_calendar_id", params.externalCalendarId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Calendário não encontrado");
  }
}

export async function disconnectCalendarIntegration(
  sb: SupabaseClient,
  params: {
    userId: string;
    provider: CalendarProvider;
  },
) {
  const integration = await getIntegration(sb, params.userId, params.provider);
  if (!integration) return;

  const { error } = await sb
    .from("calendar_integrations")
    .delete()
    .eq("id", integration.id);

  if (error) throw new Error(error.message);
}
