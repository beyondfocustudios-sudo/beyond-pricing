import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/journal/summarize  body: { entryId, body }
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = rateLimit(`summarize:${ip}`, { max: 10, windowSec: 60 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { entryId, body: text } = await req.json() as { entryId?: string; body?: string };
  if (!text) return NextResponse.json({ error: "body obrigatório" }, { status: 400 });

  let summary: string;

  if (process.env.OPENAI_API_KEY) {
    // LLM path
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Faz um resumo conciso em 2-3 frases deste texto de diário de produção audiovisual. Responde em português." },
          { role: "user", content: text.slice(0, 3000) },
        ],
        max_tokens: 200,
        temperature: 0.5,
      }),
    });
    if (!res.ok) return NextResponse.json({ error: "Erro ao chamar OpenAI" }, { status: 502 });
    const data = await res.json();
    summary = data.choices?.[0]?.message?.content ?? "";
  } else {
    // Heuristic fallback: first 2 sentences
    const sentences = text.replace(/\n+/g, " ").match(/[^.!?]+[.!?]+/g) ?? [];
    summary = sentences.slice(0, 2).join(" ").trim() || text.slice(0, 150);
  }

  // Save summary back to entry if entryId provided
  if (entryId) {
    await sb.from("journal_entries").update({ ai_summary: summary }).eq("id", entryId).eq("user_id", user.id);
  }

  return NextResponse.json({ summary, usedLLM: !!process.env.OPENAI_API_KEY });
}
