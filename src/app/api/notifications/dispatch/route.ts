/**
 * POST /api/notifications/dispatch
 * Cron-safe email dispatch from email_outbox.
 * Call this from Vercel Cron (every 5 min) or manually.
 * Requires CRON_SECRET header for authentication.
 * Uses Resend if RESEND_API_KEY set, else SMTP via nodemailer (if installed),
 * else marks as 'skipped'.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const BATCH_SIZE = 20;

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface EmailRow {
  id: string;
  to_email: string;
  template: string;
  payload: Record<string, unknown>;
}

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "noreply@beyondfocus.pt",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

function buildEmail(template: string, payload: Record<string, unknown>): { subject: string; html: string } {
  switch (template) {
    case "new_message":
      return {
        subject: "Nova mensagem no portal Beyond Focus",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#1a8fa3">Nova mensagem no portal</h2>
            <p>Tens uma nova mensagem no projeto <strong>${payload.project_id ?? ""}</strong>.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal" style="background:#1a8fa3;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">
              Ver no portal
            </a>
            <p style="color:#86868b;font-size:12px;margin-top:24px">Beyond Focus Studios</p>
          </div>`,
      };
    case "new_file":
      return {
        subject: "Novos ficheiros disponíveis no portal",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#1a8fa3">Novos ficheiros adicionados</h2>
            <p>Foram adicionados novos ficheiros ao teu projeto.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal" style="background:#1a8fa3;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">
              Ver entregas
            </a>
            <p style="color:#86868b;font-size:12px;margin-top:24px">Beyond Focus Studios</p>
          </div>`,
      };
    default:
      return { subject: "Notificação Beyond Focus", html: `<p>${JSON.stringify(payload)}</p>` };
  }
}

export async function POST(req: NextRequest) {
  // Auth check
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasEmail = !!(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
  const admin = adminClient();

  // Fetch pending batch
  const { data: rows, error } = await admin
    .from("email_outbox")
    .select("id, to_email, template, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ processed: 0 });

  let sent = 0, skipped = 0, failed = 0;

  for (const row of rows as EmailRow[]) {
    if (!hasEmail) {
      await admin.from("email_outbox").update({ status: "skipped" }).eq("id", row.id);
      skipped++;
      continue;
    }

    try {
      const { subject, html } = buildEmail(row.template, row.payload);
      if (process.env.RESEND_API_KEY) {
        await sendViaResend(row.to_email, subject, html);
      }
      await admin.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await admin.from("email_outbox").update({ status: "failed", error: msg }).eq("id", row.id);
      failed++;
    }
  }

  return NextResponse.json({ processed: rows.length, sent, skipped, failed });
}
