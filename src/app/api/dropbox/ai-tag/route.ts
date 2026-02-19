// ============================================================
// /api/dropbox/ai-tag?projectId=...&fileId=...
// Optional AI tagging for photos — only runs if:
//   1. User has ai_tagging_enabled = true in preferences
//   2. OPENAI_API_KEY env var is set
//   3. file_type === 'photo'
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Simple in-memory rate limit: max 10 requests per minute per user
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");

  if (!fileId) {
    return NextResponse.json({ error: "fileId required" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ skipped: true, reason: "No OPENAI_API_KEY configured" });
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check ai_tagging preference
  const { data: prefs } = await sb
    .from("preferences")
    .select("ai_tagging_enabled")
    .eq("user_id", user.id)
    .single();

  if (!prefs?.ai_tagging_enabled) {
    return NextResponse.json({ skipped: true, reason: "AI tagging disabled in preferences" });
  }

  // Rate limit
  if (!checkRateLimit(user.id)) {
    return NextResponse.json({ error: "Rate limit exceeded (10 req/min)" }, { status: 429 });
  }

  // Get file
  const { data: file } = await sb
    .from("deliverable_files")
    .select("id, file_type, shared_link, filename, metadata")
    .eq("id", fileId)
    .single();

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (file.file_type !== "photo") {
    return NextResponse.json({ skipped: true, reason: "Not a photo" });
  }

  if (!file.shared_link) {
    return NextResponse.json({ skipped: true, reason: "No shared link available for analysis" });
  }

  // Call OpenAI Vision
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this production photo and return a JSON array of 5-10 descriptive tags (in Portuguese). Only return the JSON array, no other text. Example: [\"exterior\", \"golden hour\", \"entrevista\", \"câmera A-roll\"]",
              },
              {
                type: "image_url",
                image_url: { url: file.shared_link, detail: "low" },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `OpenAI error: ${err}` }, { status: 502 });
    }

    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "[]";
    let tags: string[] = [];
    try {
      tags = JSON.parse(content) as string[];
    } catch {
      // If parsing fails, extract tags heuristically
      tags = content.match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, "")) ?? [];
    }

    // Update metadata.tags
    const existingMeta = (file.metadata as Record<string, unknown>) ?? {};
    const updatedMeta = { ...existingMeta, tags, ai_tagged_at: new Date().toISOString() };

    await sb
      .from("deliverable_files")
      .update({ metadata: updatedMeta })
      .eq("id", fileId);

    return NextResponse.json({ ok: true, tags });
  } catch (e) {
    return NextResponse.json({ error: "AI tagging failed: " + (e as Error).message }, { status: 500 });
  }
}
