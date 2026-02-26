import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectAccess } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const platform = req.nextUrl.searchParams.get("platform");
  const tag = req.nextUrl.searchParams.get("tag");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    await requireProjectAccess(projectId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let query = supabase
    .from("project_references")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (platform && platform !== "") {
    query = query.eq("platform", platform);
  }

  if (tag && tag !== "") {
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch references:", error);
    return NextResponse.json({ error: "Failed to fetch references" }, { status: 500 });
  }

  return NextResponse.json({ references: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await req.json();
    const { projectId, title, url, platform, notes, tags } = body;

    if (!projectId || !title) {
      return NextResponse.json({ error: "projectId and title are required" }, { status: 400 });
    }

    await requireProjectAccess(projectId);

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("project_references")
      .insert({
        project_id: projectId,
        title: title.trim(),
        url: url ? url.trim() : null,
        platform: platform || null,
        notes: notes ? notes.trim() : null,
        tags: tags && Array.isArray(tags) ? tags.filter((t: string) => typeof t === "string") : [],
        created_by: user.user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create reference:", error);
      return NextResponse.json({ error: error.message || "Failed to create reference" }, { status: 500 });
    }

    return NextResponse.json({ reference: data }, { status: 201 });
  } catch (err) {
    console.error("POST /api/portal/references error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
