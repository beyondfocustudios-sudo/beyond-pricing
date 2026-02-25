import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { buildIcsCalendar, type IcsEvent } from "@/lib/calendar-ics";

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) {
    return new Response("Not authenticated", { status: 401 });
  }

  const [{ data: tasks }, { data: callSheets }] = await Promise.all([
    sb
      .from("tasks")
      .select("id, title, due_date, status")
      .eq("user_id", user.id)
      .not("due_date", "is", null)
      .neq("status", "done")
      .order("due_date", { ascending: true })
      .limit(120),
    sb
      .from("call_sheets")
      .select("id, title, shoot_date, location_name")
      .is("deleted_at", null)
      .order("shoot_date", { ascending: true })
      .limit(120),
  ]);

  const origin = req.nextUrl.origin;
  const events: IcsEvent[] = [];

  for (const task of tasks ?? []) {
    if (!task.due_date) continue;
    const start = new Date(task.due_date);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    events.push({
      uid: `task-${task.id}@beyond-pricing`,
      summary: `Task: ${task.title}`,
      description: "Tarefa criada no Beyond Pricing",
      start,
      end,
      url: `${origin}/app/tasks`,
    });
  }

  for (const sheet of callSheets ?? []) {
    if (!sheet.shoot_date) continue;
    const start = new Date(`${sheet.shoot_date}T09:00:00.000Z`);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
    events.push({
      uid: `callsheet-${sheet.id}@beyond-pricing`,
      summary: `Shoot: ${sheet.title ?? "Call Sheet"}`,
      description: "Evento de produção (call sheet)",
      location: sheet.location_name ?? undefined,
      start,
      end,
      url: `${origin}/app/callsheets`,
    });
  }

  const ics = buildIcsCalendar(events, { name: "Beyond Pricing Feed" });
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=\"beyond-pricing-feed.ics\"",
      "Cache-Control": "no-store",
    },
  });
}
