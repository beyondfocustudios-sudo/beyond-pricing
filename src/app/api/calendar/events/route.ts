import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase-server";
import { syncAllConnectedProviders } from "@/lib/calendar-sync";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  allDay: z.boolean().default(false),
  type: z.enum(["shoot", "meeting", "review", "delivery", "travel", "other"]).default("other"),
  timezone: z.string().default("Europe/Lisbon"),
  status: z.enum(["confirmed", "tentative", "cancelled"]).default("confirmed"),
  meetingUrl: z.string().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  calendarId: z.string().uuid().optional().nullable(),
  syncToGoogle: z.boolean().optional(),
  syncToOutlook: z.boolean().optional(),
});

const updateSchema = createSchema.partial().extend({ id: z.string().uuid() });

function parseDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

async function syncWithTimeout(
  fn: Promise<unknown>,
  timeoutMs: number,
) {
  await Promise.race([
    fn,
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
}

export async function GET(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const projectId = request.nextUrl.searchParams.get("projectId");

  let query = sb
    .from("calendar_events")
    .select("id, title, description, location, starts_at, ends_at, all_day, type, status, meeting_url, project_id, calendar_id, timezone")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("starts_at", { ascending: true })
    .limit(600);

  if (from) query = query.gte("starts_at", from);
  if (to) query = query.lte("starts_at", to);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, events: data ?? [] });
}

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", details: parsed.error.flatten() }, { status: 400 });
  }

  const starts = parseDate(parsed.data.startsAt);
  const ends = parseDate(parsed.data.endsAt);

  if (!starts || !ends || ends <= starts) {
    return NextResponse.json({ error: "Datas inválidas" }, { status: 400 });
  }

  const payload = {
    user_id: user.id,
    created_by: user.id,
    title: parsed.data.title.trim(),
    description: parsed.data.description ?? null,
    location: parsed.data.location ?? null,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    all_day: parsed.data.allDay,
    type: parsed.data.type,
    status: parsed.data.status,
    meeting_url: parsed.data.meetingUrl ?? null,
    project_id: parsed.data.projectId ?? null,
    calendar_id: parsed.data.calendarId ?? null,
    timezone: parsed.data.timezone,
    sync_to_google: parsed.data.syncToGoogle ?? false,
    sync_to_outlook: parsed.data.syncToOutlook ?? false,
  };

  const { data, error } = await sb
    .from("calendar_events")
    .insert(payload)
    .select("id, title, description, location, starts_at, ends_at, type, status, project_id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Falha a criar evento" }, { status: 500 });
  }

  await syncWithTimeout(syncAllConnectedProviders(sb, user.id, "push"), 5000).catch(() => {
    // Keep event creation resilient even if external provider sync fails.
  });

  return NextResponse.json({ ok: true, event: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", details: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof parsed.data.title === "string") updates.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) updates.description = parsed.data.description ?? null;
  if (parsed.data.location !== undefined) updates.location = parsed.data.location ?? null;
  if (parsed.data.allDay !== undefined) updates.all_day = parsed.data.allDay;
  if (parsed.data.type !== undefined) updates.type = parsed.data.type;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.meetingUrl !== undefined) updates.meeting_url = parsed.data.meetingUrl ?? null;
  if (parsed.data.projectId !== undefined) updates.project_id = parsed.data.projectId ?? null;
  if (parsed.data.calendarId !== undefined) updates.calendar_id = parsed.data.calendarId ?? null;
  if (parsed.data.timezone !== undefined) updates.timezone = parsed.data.timezone;
  if (parsed.data.syncToGoogle !== undefined) updates.sync_to_google = parsed.data.syncToGoogle;
  if (parsed.data.syncToOutlook !== undefined) updates.sync_to_outlook = parsed.data.syncToOutlook;

  if (parsed.data.startsAt) {
    const starts = parseDate(parsed.data.startsAt);
    if (!starts) return NextResponse.json({ error: "startsAt inválido" }, { status: 400 });
    updates.starts_at = starts.toISOString();
  }

  if (parsed.data.endsAt) {
    const ends = parseDate(parsed.data.endsAt);
    if (!ends) return NextResponse.json({ error: "endsAt inválido" }, { status: 400 });
    updates.ends_at = ends.toISOString();
  }

  const { data, error } = await sb
    .from("calendar_events")
    .update(updates)
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .select("id, title, description, location, starts_at, ends_at, type, status, project_id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Falha a atualizar evento" }, { status: 500 });
  }

  await syncWithTimeout(syncAllConnectedProviders(sb, user.id, "push"), 5000).catch(() => {
    // Keep event update resilient even if external provider sync fails.
  });

  return NextResponse.json({ ok: true, event: data });
}

export async function DELETE(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  const { error } = await sb
    .from("calendar_events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await syncWithTimeout(syncAllConnectedProviders(sb, user.id, "push"), 5000).catch(() => {
    // Keep event delete resilient even if external provider sync fails.
  });

  return NextResponse.json({ ok: true });
}
