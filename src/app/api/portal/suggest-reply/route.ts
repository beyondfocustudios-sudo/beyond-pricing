import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/portal/suggest-reply  body: { conversationId, recentMessages }
// Returns a draft reply suggestion for team members (never auto-sends)
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = rateLimit(`suggest-reply:${ip}`, { max: 10, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "LLM não configurado", usedLLM: false, suggestion: null });
  }

  const { recentMessages } = await req.json() as { recentMessages?: { sender_type: string; body: string }[] };
  if (!Array.isArray(recentMessages) || recentMessages.length === 0) {
    return NextResponse.json({ error: "recentMessages obrigatório" }, { status: 400 });
  }

  const context = recentMessages.slice(-5).map((m) =>
    `${m.sender_type === "client" ? "Cliente" : "Equipa"}: ${m.body}`
  ).join("\n");

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
          content: "Sugere uma resposta profissional e empática para a equipa de produção audiovisual. Responde em português, máximo 3 frases. Esta é apenas uma sugestão — nunca é enviada automaticamente.",
        },
        { role: "user", content: `Conversa recente:\n${context}\n\nSugere uma resposta da equipa:` },
      ],
      max_tokens: 200,
      temperature: 0.6,
    }),
  });

  if (!res.ok) return NextResponse.json({ error: "Erro ao chamar OpenAI" }, { status: 502 });
  const data = await res.json();
  const suggestion = data.choices?.[0]?.message?.content ?? "";

  return NextResponse.json({ suggestion, usedLLM: true });
}
