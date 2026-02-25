import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildIcsCalendar, type IcsEvent } from "@/lib/calendar-ics";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  let targetUserId: string | null = null;
  let targetCalendarId: string | null = null;
  const sb = await createClient();
  let useServiceReader = false;

  if (token) {
    const admin = createServiceClient();
    const { data: feedToken } = await admin
      .from("calendar_feed_tokens")
      .select("user_id, calendar_id, revoked_at")
      .eq("token", token)
      .maybeSingle();

    if (!feedToken || feedToken.revoked_at) {
      return new Response("Invalid feed token", { status: 404 });
    }

    targetUserId = String(feedToken.user_id);
    targetCalendarId = feedToken.calendar_id ? String(feedToken.calendar_id) : null;
    useServiceReader = true;
  } else {
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      return new Response("Not authenticated", { status: 401 });
    }
    targetUserId = user.id;
  }

  const reader = useServiceReader ? createServiceClient() : sb;

  let calendarQuery = reader
    .from("calendar_events")
    .select("id, title, description, location, starts_at, ends_at")
    .eq("user_id", targetUserId)
    .is("deleted_at", null)
    .order("starts_at", { ascending: true })
    .limit(300);

  if (targetCalendarId) {
    calendarQuery = calendarQuery.eq("calendar_id", targetCalendarId);
  }

  const [{ data: calendarRows }, { data: tasks }] = await Promise.all([
    calendarQuery,
    reader
      .from("tasks")
      .select("id, title, due_date, status")
      .eq("user_id", targetUserId)
      .not("due_date", "is", null)
      .neq("status", "done")
      .order("due_date", { ascending: true })
      .limit(120),
  ]);

  const origin = req.nextUrl.origin;
  const icsEvents: IcsEvent[] = [];

  for (const event of calendarRows ?? []) {
    const start = new Date(event.starts_at);
    const end = new Date(event.ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    icsEvents.push({
      uid: `calendar-event-${event.id}@beyond-pricing`,
      summary: event.title,
      description: event.description ?? "Evento de calendário",
      location: event.location ?? undefined,
      start,
      end,
      url: `${origin}/app/calendar`,
    });
  }

  for (const task of tasks ?? []) {
    if (!task.due_date) continue;
    const start = new Date(task.due_date);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    icsEvents.push({
      uid: `task-${task.id}@beyond-pricing`,
      summary: `Task: ${task.title}`,
      description: "Tarefa criada no Beyond Pricing",
      start,
      end,
      url: `${origin}/app/tasks`,
    });
  }

  const ics = buildIcsCalendar(icsEvents, { name: "Beyond Pricing Feed" });
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=\"beyond-pricing-feed.ics\"",
      "Cache-Control": "no-store",
    },
  });
}
