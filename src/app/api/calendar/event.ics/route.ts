import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { buildIcsCalendar, type IcsEvent } from "@/lib/calendar-ics";

function parseDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) {
    return new Response("Not authenticated", { status: 401 });
  }

  const source = req.nextUrl.searchParams.get("source");
  const id = req.nextUrl.searchParams.get("id");
  let event: IcsEvent | null = null;

  if (source === "task" && id) {
    const { data: task } = await sb
      .from("tasks")
      .select("id, title, due_date")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (task?.due_date) {
      const start = parseDate(task.due_date);
      if (start) {
        event = {
          uid: `task-${task.id}@beyond-pricing`,
          summary: `Task: ${task.title}`,
          description: "Evento exportado do Beyond Pricing",
          start,
          end: new Date(start.getTime() + 45 * 60 * 1000),
        };
      }
    }
  } else {
    const title = req.nextUrl.searchParams.get("title") ?? "Beyond Pricing Event";
    const description = req.nextUrl.searchParams.get("description") ?? "Evento exportado do Beyond Pricing";
    const location = req.nextUrl.searchParams.get("location") ?? undefined;
    const start = parseDate(req.nextUrl.searchParams.get("start"));
    const end = parseDate(req.nextUrl.searchParams.get("end"));

    if (start) {
      event = {
        uid: `adhoc-${Date.now()}@beyond-pricing`,
        summary: title,
        description,
        location,
        start,
        end: end ?? new Date(start.getTime() + 45 * 60 * 1000),
      };
    }
  }

  if (!event) {
    return new Response("Event not found", { status: 404 });
  }

  const ics = buildIcsCalendar([event], { name: "Beyond Pricing Event" });
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"beyond-event.ics\"",
      "Cache-Control": "no-store",
    },
  });
}
