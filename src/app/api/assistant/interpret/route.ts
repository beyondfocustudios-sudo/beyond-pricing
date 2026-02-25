import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  type AssistantIntent,
  estimateTokenUsage,
  getAssistantSettings,
  getAssistantUsage,
  incrementAssistantUsage,
  inferDeterministicIntent,
  isTeamRole,
  resolveAudienceRole,
} from "@/lib/hq-assistant";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

type AssistantAction = {
  id: string;
  label: string;
  action: "create_task" | "find_project" | "open_item" | "report_bug" | "help_navigation";
  payload?: Record<string, unknown>;
};

type InterpretResponse = {
  intent: AssistantIntent;
  confidence: number;
  args: Record<string, unknown>;
  response: string;
  suggested_actions: AssistantAction[];
  source: "deterministic" | "ai";
};

const INTENT_WHITELIST: AssistantIntent[] = [
  "create_task",
  "find_project",
  "open_item",
  "report_bug",
  "summarize_context",
  "help_navigation",
  "unsupported",
];

function normalizeIntent(value: unknown): AssistantIntent {
  if (typeof value !== "string") return "unsupported";
  return INTENT_WHITELIST.includes(value as AssistantIntent)
    ? (value as AssistantIntent)
    : "unsupported";
}

function parseMaybeJson(input: string) {
  const raw = input.trim();
  const noFence = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(noFence) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeAssistantActions(input: unknown): AssistantAction[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const action = String(data.action ?? "").trim();
      if (!["create_task", "find_project", "open_item", "report_bug", "help_navigation"].includes(action)) {
        return null;
      }
      return {
        id: String(data.id ?? `${action}-${index + 1}`),
        label: String(data.label ?? action),
        action: action as AssistantAction["action"],
        payload: typeof data.payload === "object" && data.payload ? (data.payload as Record<string, unknown>) : undefined,
      } satisfies AssistantAction;
    })
    .filter(Boolean) as AssistantAction[];
}

function deterministicResponse(message: string, route: string): InterpretResponse {
  const intent = inferDeterministicIntent(message);

  if (intent === "create_task") {
    const cleaned = message
      .replace(/^(cria|criar|adiciona|adicionar)\s+/i, "")
      .replace(/\s+(por favor|pf)\s*$/i, "")
      .trim();

    return {
      intent,
      confidence: 0.84,
      args: {
        title: cleaned || "Nova tarefa",
        priority: "medium",
      },
      response: "Posso criar essa tarefa agora. Confirma o título e prioridade.",
      suggested_actions: [
        {
          id: "create-task-now",
          label: "Criar tarefa",
          action: "create_task",
          payload: { title: cleaned || "Nova tarefa", priority: "medium" },
        },
      ],
      source: "deterministic",
    };
  }

  if (intent === "find_project") {
    const query = message
      .replace(/^(procura|procurar|encontra|encontrar)\s+/i, "")
      .replace(/\s*projeto[s]?/i, "")
      .trim();

    return {
      intent,
      confidence: 0.82,
      args: { query },
      response: "Posso pesquisar projetos e abrir o resultado certo.",
      suggested_actions: [
        { id: "find-project", label: "Pesquisar projetos", action: "find_project", payload: { query } },
      ],
      source: "deterministic",
    };
  }

  if (intent === "open_item") {
    return {
      intent,
      confidence: 0.72,
      args: { route },
      response: "Indica o módulo e eu abro diretamente.",
      suggested_actions: [
        { id: "help-navigation", label: "Ver atalhos", action: "help_navigation" },
      ],
      source: "deterministic",
    };
  }

  if (intent === "report_bug") {
    return {
      intent,
      confidence: 0.9,
      args: { route },
      response: "Vou abrir o fluxo de bug report com logs automáticos.",
      suggested_actions: [
        { id: "report-bug", label: "Reportar problema", action: "report_bug" },
      ],
      source: "deterministic",
    };
  }

  if (intent === "summarize_context") {
    return {
      intent,
      confidence: 0.67,
      args: {},
      response: "Resumo rápido: estás nesta rota e posso sugerir próximos passos operacionais.",
      suggested_actions: [
        { id: "help-navigation", label: "Ver navegação", action: "help_navigation" },
      ],
      source: "deterministic",
    };
  }

  if (intent === "help_navigation") {
    return {
      intent,
      confidence: 0.8,
      args: { route },
      response: "Posso ajudar a navegar por Dashboard, Projetos, Clientes, Inbox, Insights e Settings.",
      suggested_actions: [
        { id: "open-projects", label: "Abrir projetos", action: "open_item", payload: { href: "/app/projects" } },
        { id: "open-inbox", label: "Abrir inbox", action: "open_item", payload: { href: "/app/inbox" } },
      ],
      source: "deterministic",
    };
  }

  return {
    intent: "unsupported",
    confidence: 0.3,
    args: {},
    response: "Esse pedido ainda não está suportado. Posso criar tarefas, pesquisar projetos, ajudar na navegação e reportar bugs.",
    suggested_actions: [
      { id: "create-task", label: "Criar tarefa", action: "create_task" },
      { id: "search-project", label: "Pesquisar projeto", action: "find_project" },
      { id: "report-problem", label: "Reportar problema", action: "report_bug" },
    ],
    source: "deterministic",
  };
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = rateLimit(`assistant-interpret:${ip}`, { max: 40, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    context_minimal?: {
      route?: string;
      project_id?: string | null;
      recent_errors?: Array<Record<string, unknown>>;
      recent_failed_requests?: Array<Record<string, unknown>>;
    };
  };

  const message = String(body.message ?? "").trim();
  const route = String(body.context_minimal?.route ?? "/app").slice(0, 160);

  if (!message) {
    return NextResponse.json({ error: "message obrigatório" }, { status: 400 });
  }

  const [settings, role, usage] = await Promise.all([
    getAssistantSettings(supabase),
    resolveAudienceRole(supabase, user),
    getAssistantUsage(supabase, user.id),
  ]);

  if (!settings.enableHqAssistant) {
    return NextResponse.json({ error: "HQ Assistant desativado" }, { status: 403 });
  }

  const deterministic = deterministicResponse(message, route);
  const aiAllowed = settings.enableAiAssistant && isTeamRole(role) && Boolean(process.env.OPENAI_API_KEY);

  if (!aiAllowed) {
    return NextResponse.json({
      ...deterministic,
      ai_enabled: false,
      usage: {
        count: usage.usageCount,
        limit: settings.aiWeeklyLimit,
        week_start: usage.weekStart,
      },
    });
  }

  if (usage.usageCount >= settings.aiWeeklyLimit) {
    return NextResponse.json(
      {
        ...deterministic,
        response: "Limite semanal de AI atingido. Podes continuar a usar ações determinísticas.",
        ai_enabled: true,
        rate_limited: true,
        usage: {
          count: usage.usageCount,
          limit: settings.aiWeeklyLimit,
          week_start: usage.weekStart,
        },
      },
      { status: 429 },
    );
  }

  const [auditEventsRes, notificationsRes] = await Promise.all([
    supabase
      .from("audit_log")
      .select("action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("notifications")
      .select("type, title, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const minimalContext = {
    role,
    route,
    project_id: body.context_minimal?.project_id ?? null,
    events: (auditEventsRes.data ?? []).slice(0, 10),
    notifications: (notificationsRes.data ?? []).slice(0, 10),
    recent_errors: (body.context_minimal?.recent_errors ?? []).slice(0, 5),
    recent_failed_requests: (body.context_minimal?.recent_failed_requests ?? []).slice(0, 5),
  };

  const model = process.env.ASSISTANT_MODEL || process.env.MODEL_ASSISTANT || "gpt-5-mini";

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_completion_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Tu és HQ Assistant v2. Responde apenas JSON válido com {intent, confidence, args, response, suggested_actions}. "
              + "Intents permitidas: create_task, find_project, open_item, report_bug, summarize_context, help_navigation, unsupported. "
              + "Nunca proposes ações destrutivas. Resposta curta em pt-PT.",
          },
          {
            role: "user",
            content: JSON.stringify({ message, context: minimalContext }),
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const fallback = deterministicResponse(message, route);
      return NextResponse.json({
        ...fallback,
        ai_enabled: true,
        ai_failed: true,
        usage: {
          count: usage.usageCount,
          limit: settings.aiWeeklyLimit,
          week_start: usage.weekStart,
        },
      });
    }

    const aiPayload = (await aiResponse.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const rawContent = String(aiPayload.choices?.[0]?.message?.content ?? "").trim();
    const parsed = parseMaybeJson(rawContent);

    if (!parsed) {
      const fallback = deterministicResponse(message, route);
      return NextResponse.json({
        ...fallback,
        ai_enabled: true,
        ai_failed: true,
        usage: {
          count: usage.usageCount,
          limit: settings.aiWeeklyLimit,
          week_start: usage.weekStart,
        },
      });
    }

    const intent = normalizeIntent(parsed.intent);
    const confidence = Number(parsed.confidence ?? 0.6);
    const responseText = String(parsed.response ?? deterministic.response).slice(0, 800);

    const output: InterpretResponse = {
      intent,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.6,
      args: typeof parsed.args === "object" && parsed.args ? (parsed.args as Record<string, unknown>) : {},
      response: responseText || deterministic.response,
      suggested_actions: normalizeAssistantActions(parsed.suggested_actions),
      source: "ai",
    };

    if (!output.suggested_actions.length) {
      output.suggested_actions = deterministic.suggested_actions;
    }

    const estimated = estimateTokenUsage(message, output.response);
    const nextUsage = await incrementAssistantUsage(supabase, user.id, 1, estimated);

    return NextResponse.json({
      ...output,
      ai_enabled: true,
      usage: {
        count: nextUsage.usageCount,
        limit: settings.aiWeeklyLimit,
        week_start: nextUsage.weekStart,
      },
    });
  } catch {
    const fallback = deterministicResponse(message, route);
    return NextResponse.json({
      ...fallback,
      ai_enabled: true,
      ai_failed: true,
      usage: {
        count: usage.usageCount,
        limit: settings.aiWeeklyLimit,
        week_start: usage.weekStart,
      },
    });
  }
}
