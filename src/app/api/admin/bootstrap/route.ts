import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/admin/bootstrap
// Ensures OWNER_EMAIL has owner role in team_members + app_metadata
// Safe to call multiple times (idempotent)
export async function POST() {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    return NextResponse.json({ error: "OWNER_EMAIL env var not set" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Find user by email
  const { data: users, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const owner = users.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase());
  if (!owner) {
    return NextResponse.json({
      error: `User not found: ${ownerEmail}. Make sure they have signed up first.`,
    }, { status: 404 });
  }

  // Set app_metadata.role = "owner"
  const { error: metaErr } = await supabase.auth.admin.updateUserById(owner.id, {
    app_metadata: { ...owner.app_metadata, role: "owner" },
  });
  if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 });

  // Upsert into team_members
  const { error: tmErr } = await supabase
    .from("team_members")
    .upsert({ user_id: owner.id, role: "owner" }, { onConflict: "user_id" });
  if (tmErr) return NextResponse.json({ error: tmErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    userId: owner.id,
    email: owner.email,
    message: `User ${ownerEmail} is now owner`,
  });
}

// GET /api/admin/bootstrap - check current status
export async function GET() {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    return NextResponse.json({ configured: false, error: "OWNER_EMAIL not set" });
  }

  const supabase = createServiceClient();
  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const owner = users?.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase());

  if (!owner) {
    return NextResponse.json({ configured: false, ownerEmail, userExists: false });
  }

  const { data: tm } = await supabase
    .from("team_members")
    .select("role")
    .eq("user_id", owner.id)
    .single();

  return NextResponse.json({
    configured: true,
    ownerEmail,
    userId: owner.id,
    appMetadataRole: owner.app_metadata?.role,
    teamMembersRole: tm?.role,
    isOwner: tm?.role === "owner",
  });
}
