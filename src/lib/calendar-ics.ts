export type IcsEvent = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  url?: string;
};

function esc(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsDate(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function eventBlock(event: IcsEvent) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${esc(event.uid)}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${esc(event.summary)}`,
  ];

  if (event.description) lines.push(`DESCRIPTION:${esc(event.description)}`);
  if (event.location) lines.push(`LOCATION:${esc(event.location)}`);
  if (event.url) lines.push(`URL:${esc(event.url)}`);

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export function buildIcsCalendar(events: IcsEvent[], opts?: { name?: string; prodId?: string }) {
  const name = opts?.name ?? "Beyond Pricing Calendar";
  const prodId = opts?.prodId ?? "-//Beyond Pricing//Calendar//PT";
  const parts = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    ...events.map(eventBlock),
    "END:VCALENDAR",
    "",
  ];
  return parts.join("\r\n");
}
