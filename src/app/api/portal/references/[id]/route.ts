import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectAccess } from "@/lib/authz";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  try {
    const { projectId, title, url, platform, notes, tags } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    await requireProjectAccess(projectId);

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify reference belongs to project and was created by user
    const { data: reference, error: fetchError } = await supabase
      .from("project_references")
      .select("created_by")
      .eq("id", id)
      .eq("project_id", projectId)
      .single();

    if (fetchError || !reference) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }

    if (reference.created_by !== user.user.id) {
      return NextResponse.json({ error: "You can only edit your own references" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (url !== undefined) updateData.url = url ? url.trim() : null;
    if (platform !== undefined) updateData.platform = platform || null;
    if (notes !== undefined) updateData.notes = notes ? notes.trim() : null;
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags.filter((t: string) => typeof t === "string") : [];

    const { data, error } = await supabase
      .from("project_references")
      .update(updateData)
      .eq("id", id)
      .eq("project_id", projectId)
      .select()
      .single();

    if (error) {
      console.error("Failed to update reference:", error);
      return NextResponse.json({ error: error.message || "Failed to update reference" }, { status: 500 });
    }

    return NextResponse.json({ reference: data });
  } catch (err) {
    console.error("PATCH /api/portal/references/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    await requireProjectAccess(projectId);

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify reference belongs to project and was created by user
    const { data: reference, error: fetchError } = await supabase
      .from("project_references")
      .select("created_by")
      .eq("id", id)
      .eq("project_id", projectId)
      .single();

    if (fetchError || !reference) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }

    if (reference.created_by !== user.user.id) {
      return NextResponse.json({ error: "You can only delete your own references" }, { status: 403 });
    }

    const { error } = await supabase
      .from("project_references")
      .delete()
      .eq("id", id)
      .eq("project_id", projectId);

    if (error) {
      console.error("Failed to delete reference:", error);
      return NextResponse.json({ error: error.message || "Failed to delete reference" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/portal/references/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
