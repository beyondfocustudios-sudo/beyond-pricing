import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveSupportAccess } from "@/lib/support";

function normalizeSeverity(value: unknown) {
  const str = String(value ?? "").toLowerCase();
  if (str === "low" || str === "medium" || str === "high" || str === "critical") return str;
  return null;
}

function normalizeStatus(value: unknown) {
  const str = String(value ?? "").toLowerCase();
  if (str === "open" || str === "in_progress" || str === "resolved" || str === "closed") return str;
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const access = await resolveSupportAccess(supabase, user);

  let ticketQuery = supabase
    .from("support_tickets")
    .select("id, org_id, user_id, title, description, route, severity, status, metadata, created_at, updated_at")
    .eq("id", ticketId);

  if (!access.isAdmin) {
    ticketQuery = ticketQuery.eq("user_id", user.id);
  }

  const { data: ticket, error: ticketError } = await ticketQuery.maybeSingle();
  if (ticketError) {
    return NextResponse.json({ error: ticketError.message }, { status: 500 });
  }

  if (!ticket) {
    return NextResponse.json({ error: "Ticket não encontrado" }, { status: 404 });
  }

  const { data: logs, error: logsError } = await supabase
    .from("support_ticket_logs")
    .select("id, type, payload, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (logsError) {
    return NextResponse.json({ error: logsError.message }, { status: 500 });
  }

  return NextResponse.json({ ticket, logs: logs ?? [], canManage: access.isAdmin });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const access = await resolveSupportAccess(supabase, user);
  if (!access.isAdmin) {
    return NextResponse.json({ error: "Apenas owner/admin" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    severity?: string;
  };

  const status = normalizeStatus(body.status);
  const severity = normalizeSeverity(body.severity);

  if (!status && !severity) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (severity) updates.severity = severity;

  const { data, error: updateError } = await supabase
    .from("support_tickets")
    .update(updates)
    .eq("id", ticketId)
    .select("id, title, status, severity, updated_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ticket: data });
}
