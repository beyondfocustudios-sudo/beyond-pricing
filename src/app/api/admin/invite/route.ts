import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireGlobalAdmin } from "@/lib/authz";

// POST /api/admin/invite
// Invite an internal team member (creates Supabase user + team_members row)
export async function POST(req: NextRequest) {
  try {
    await requireGlobalAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { email: string; role?: string; name?: string };
  const { email, role = "member", name } = body;
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const supabase = createServiceClient();

  // Create user with invite (they get a magic link to set password)
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name ?? email.split("@")[0] },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const userId = data.user.id;

  // Add to team_members
  await supabase.from("team_members").upsert(
    { user_id: userId, role },
    { onConflict: "user_id" }
  );

  return NextResponse.json({ ok: true, userId, email });
}
