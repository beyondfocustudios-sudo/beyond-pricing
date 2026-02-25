import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

function fallbackSuggestion(lastBody: string, senderType: string) {
  const base = lastBody.trim();
  if (!base) {
    return "Obrigado pelo update. Vou validar internamente e respondo ainda hoje com próximos passos.";
  }

  if (senderType === "client") {
    return `Obrigado pelo contexto. Vamos alinhar isto e já te enviamos confirmação com timing e próximos passos.`;
  }

  return "Perfeito. Fico a aguardar feedback do cliente para avançarmos para o próximo passo.";
}

// POST /api/conversations/[id]/suggest — AI reply suggestion with deterministic fallback
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: conversation } = await sb
    .from("conversations")
    .select("id, project_id, client_id")
    .eq("id", id)
    .maybeSingle();

  if (!conversation?.id) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const { data: messages } = await sb
    .from("messages")
    .select("body, sender_type, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(6);

  const latest = messages?.[0];
  const fallback = fallbackSuggestion(String(latest?.body ?? ""), String(latest?.sender_type ?? ""));

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ suggestion: fallback, source: "fallback" });
  }

  try {
    const model = process.env.ASSISTANT_MODEL || process.env.MODEL_ASSISTANT || "gpt-5-mini";
    const context = (messages ?? [])
      .slice()
      .reverse()
      .map((m) => `${m.sender_type === "client" ? "Cliente" : "Equipa"}: ${String(m.body ?? "").trim()}`)
      .join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_completion_tokens: 140,
        messages: [
          {
            role: "system",
            content:
              "Escreve apenas uma resposta curta em pt-PT para mensagem de cliente em contexto de produtora audiovisual. "
              + "Tom profissional e objetivo. Sem markdown.",
          },
          {
            role: "user",
            content: `Conversa:\n${context}\n\nSugere resposta da Equipa Beyond em 1-3 frases.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ suggestion: fallback, source: "fallback" });
    }

    const payload = await res.json() as { choices?: Array<{ message?: { content?: string | null } }> };
    const text = String(payload.choices?.[0]?.message?.content ?? "").trim();
    if (!text) {
      return NextResponse.json({ suggestion: fallback, source: "fallback" });
    }

    return NextResponse.json({ suggestion: text, source: "ai" });
  } catch {
    return NextResponse.json({ suggestion: fallback, source: "fallback" });
  }
}
