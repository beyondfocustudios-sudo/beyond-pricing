import { NextRequest, NextResponse } from "next/server";

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toIcsUtc(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function GET(request: NextRequest) {
  const title = String(request.nextUrl.searchParams.get("title") ?? "Evento Beyond").trim();
  const startsAt = String(request.nextUrl.searchParams.get("startsAt") ?? "").trim();
  const endsAt = String(request.nextUrl.searchParams.get("endsAt") ?? "").trim();
  const description = String(request.nextUrl.searchParams.get("description") ?? "").trim();
  const location = String(request.nextUrl.searchParams.get("location") ?? "").trim();

  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt || startsAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Datas inválidas." }, { status: 400 });
  }

  const uid = `${Math.random().toString(36).slice(2)}@beyond-pricing`;
  const dtStamp = toIcsUtc(new Date());
  const dtStart = toIcsUtc(startDate);
  const dtEnd = toIcsUtc(endDate > startDate ? endDate : new Date(startDate.getTime() + 60 * 60 * 1000));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Beyond Pricing//Quick Event//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(title)}`,
    description ? `DESCRIPTION:${escapeIcs(description)}` : null,
    location ? `LOCATION:${escapeIcs(location)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].filter(Boolean);

  return new NextResponse(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=event.ics",
      "Cache-Control": "no-store",
    },
  });
}
