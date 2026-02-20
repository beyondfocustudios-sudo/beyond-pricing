import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/tasks/from-text  body: { text }
// Parse natural language into task suggestions (LLM if available, heuristic fallback)
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = rateLimit(`tasks-from-text:${ip}`, { max: 10, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { text } = await req.json() as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: "text obrigatório" }, { status: 400 });

  type TaskSuggestion = { title: string; priority?: string; due_date?: string };
  let tasks: TaskSuggestion[];

  if (process.env.OPENAI_API_KEY) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Extrai tarefas acionáveis do texto. Responde com JSON: { "tasks": [{ "title": string, "priority": "low"|"medium"|"high"|"urgent", "due_date": "YYYY-MM-DD" | null }] }. Máximo 10 tarefas. Texto em português.`,
          },
          { role: "user", content: text.slice(0, 2000) },
        ],
        max_tokens: 500,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return NextResponse.json({ error: "Erro ao chamar OpenAI" }, { status: 502 });
    const data = await res.json();
    try {
      const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      tasks = parsed.tasks ?? [];
    } catch { tasks = []; }
  } else {
    // Heuristic: split by newline or bullet, take lines that look like actions
    const lines = text.split(/\n|•|-/).map((l) => l.trim()).filter((l) => l.length > 5 && l.length < 200);
    tasks = lines.slice(0, 10).map((line) => ({ title: line, priority: "medium" }));
  }

  return NextResponse.json({ tasks, usedLLM: !!process.env.OPENAI_API_KEY });
}
