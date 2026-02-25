import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getAssistantSettings, isTeamRole } from "@/lib/hq-assistant";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { makeSupportTitle, resolveSupportAccess } from "@/lib/support";

function normalizeSeverity(value: unknown) {
  const str = String(value ?? "medium").toLowerCase();
  if (str === "low" || str === "medium" || str === "high" || str === "critical") return str;
  return "medium";
}

async function aiEnhanceTicket(payload: {
  message: string;
  expected: string;
  steps: string;
  route: string;
  userRole: string;
}) {
  if (!process.env.OPENAI_API_KEY) return null;

  const model = process.env.ASSISTANT_MODEL || process.env.MODEL_ASSISTANT || "gpt-5-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_completion_tokens: 180,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Gera JSON compacto para ticket: {title, severity, summary, repro_steps}. "
            + "severity: low|medium|high|critical. Linguagem pt-PT e factual.",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = String(data.choices?.[0]?.message?.content ?? "").trim();
  if (!content) return null;

  const clean = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

  try {
    const parsed = JSON.parse(clean) as {
      title?: string;
      severity?: string;
      summary?: string;
      repro_steps?: string;
    };

    return {
      title: typeof parsed.title === "string" ? parsed.title.trim() : "",
      severity: normalizeSeverity(parsed.severity),
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      reproSteps: typeof parsed.repro_steps === "string" ? parsed.repro_steps.trim() : "",
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const settings = await getAssistantSettings(supabase);
  if (!settings.enableHqAssistant) {
    return NextResponse.json({ error: "HQ Assistant desativado" }, { status: 403 });
  }

  const access = await resolveSupportAccess(supabase, user);
  const status = String(request.nextUrl.searchParams.get("status") ?? "").trim();
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 50), 1), 200);

  let query = supabase
    .from("support_tickets")
    .select("id, org_id, user_id, title, description, route, severity, status, metadata, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!access.isAdmin) {
    query = query.eq("user_id", user.id);
  } else if (access.orgId) {
    query = query.eq("org_id", access.orgId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error: queryError } = await query;
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  return NextResponse.json({
    tickets: data ?? [],
    canManageAll: access.isAdmin,
  });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = rateLimit(`support-ticket:${ip}`, { max: 20, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    expected?: string;
    steps?: string;
    severity?: string;
    route?: string;
    metadata?: Record<string, unknown>;
    use_ai?: boolean;
  };

  const route = String(body.route ?? "/app").slice(0, 180);
  const description = String(body.description ?? "").trim();
  const expected = String(body.expected ?? "").trim();
  const steps = String(body.steps ?? "").trim();

  if (!description && !expected && !steps) {
    return NextResponse.json({ error: "Descrição ou contexto obrigatório" }, { status: 400 });
  }

  const settings = await getAssistantSettings(supabase);
  if (!settings.enableHqAssistant) {
    return NextResponse.json({ error: "HQ Assistant desativado" }, { status: 403 });
  }

  const access = await resolveSupportAccess(supabase, user);

  let severity = normalizeSeverity(body.severity);
  let title = String(body.title ?? "").trim();
  if (!title) {
    title = makeSupportTitle(description || expected || steps, route);
  }

  const canUseAi = settings.enableAiAssistant && isTeamRole((access.role ?? "") as "owner" | "admin" | "member") && Boolean(process.env.OPENAI_API_KEY);
  if (body.use_ai && canUseAi) {
    const enhanced = await aiEnhanceTicket({
      message: description,
      expected,
      steps,
      route,
      userRole: access.role ?? "unknown",
    });

    if (enhanced) {
      if (!String(body.title ?? "").trim() && enhanced.title) title = enhanced.title;
      if (enhanced.severity) severity = normalizeSeverity(enhanced.severity);
    }
  }

  const metadata = {
    ...(body.metadata ?? {}),
    route,
    expected,
    steps,
    audience: access.audience,
  };

  const { data: ticket, error: insertError } = await supabase
    .from("support_tickets")
    .insert({
      org_id: access.orgId,
      user_id: user.id,
      title,
      description,
      route,
      severity,
      status: "open",
      metadata,
    })
    .select("id, title, severity, status, created_at")
    .single();

  if (insertError || !ticket) {
    return NextResponse.json({ error: insertError?.message ?? "Falha a criar ticket" }, { status: 500 });
  }

  const consoleErrors = Array.isArray((body.metadata ?? {}).console_errors)
    ? ((body.metadata as Record<string, unknown>).console_errors as Array<Record<string, unknown>>)
    : [];

  const failedRequests = Array.isArray((body.metadata ?? {}).failed_requests)
    ? ((body.metadata as Record<string, unknown>).failed_requests as Array<Record<string, unknown>>)
    : [];

  const logs = [
    {
      ticket_id: ticket.id,
      type: "client_snapshot",
      payload: {
        route,
        expected,
        steps,
        user_agent: (body.metadata as Record<string, unknown> | undefined)?.user_agent ?? null,
        timestamp: new Date().toISOString(),
      },
    },
    ...consoleErrors.slice(0, 20).map((entry) => ({
      ticket_id: ticket.id,
      type: "console_error",
      payload: entry,
    })),
    ...failedRequests.slice(0, 20).map((entry) => ({
      ticket_id: ticket.id,
      type: "failed_request",
      payload: entry,
    })),
  ];

  if (logs.length > 0) {
    await supabase.from("support_ticket_logs").insert(logs);
  }

  return NextResponse.json({ ticket }, { status: 201 });
}
