import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/admin/bootstrap
// Called once on first deploy to ensure OWNER_EMAIL has owner role in team_members
export async function POST() {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    return NextResponse.json({ error: "OWNER_EMAIL not set" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Find user by email
  const { data: users, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const owner = users.users.find((u) => u.email === ownerEmail);
  if (!owner) {
    return NextResponse.json({ error: `User not found: ${ownerEmail}` }, { status: 404 });
  }

  // Set app_metadata.role = "owner"
  await supabase.auth.admin.updateUserById(owner.id, {
    app_metadata: { ...owner.app_metadata, role: "owner" },
  });

  // Upsert into team_members
  await supabase.from("team_members").upsert(
    { user_id: owner.id, role: "owner" },
    { onConflict: "user_id" }
  );

  return NextResponse.json({ ok: true, userId: owner.id, email: ownerEmail });
}
