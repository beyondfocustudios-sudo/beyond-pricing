import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/admin/org-role
// Returns the current user's org role from team_members
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ role: null, isAdmin: false }, { status: 401 });

  // Check app_metadata first (fast, no DB)
  const metaRole = user.app_metadata?.role as string | undefined;
  const isMetaAdmin = metaRole === "owner" || metaRole === "admin";

  // Check team_members table
  const { data: tm } = await supabase
    .from("team_members")
    .select("role")
    .eq("user_id", user.id)
    .single();

  const role = tm?.role ?? (isMetaAdmin ? metaRole : null);
  const isAdmin = role === "owner" || role === "admin";

  return NextResponse.json({ role, isAdmin, isOwner: role === "owner" });
}
