import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectAccess } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const category = req.nextUrl.searchParams.get("category");
  const phase = req.nextUrl.searchParams.get("phase");
  const search = req.nextUrl.searchParams.get("search");

  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  try { await requireProjectAccess(projectId); } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  // Get deliverable_files via deliverables -> project
  let query = supabase
    .from("deliverable_files")
    .select("*, deliverable:deliverable_id(project_id)")
    .eq("is_deleted", false);

  if (category && category !== "all") query = query.eq("category", category);
  if (phase && phase !== "all") query = query.eq("folder_phase", phase);
  if (search) {
    query = query.or(`filename.ilike.%${search}%,name.ilike.%${search}%`);
  }

  query = query.order("filename", { ascending: true }).limit(200);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter by project_id
  const files = (data ?? []).filter(
    (f: { deliverable: { project_id: string } | null }) => f.deliverable?.project_id === projectId
  );

  return NextResponse.json(files);
}
