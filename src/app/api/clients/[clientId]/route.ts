import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireOwnerAdminUser } from "@/lib/portal-impersonation";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireOwnerAdminUser();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { clientId } = await params;
  const body = (await request.json().catch(() => ({}))) as { revokePortal?: boolean };
  const revokePortal = Boolean(body.revokePortal);

  const admin = createServiceClient();

  const { data: existing } = await admin
    .from("clients")
    .select("id, name, deleted_at")
    .eq("id", clientId)
    .maybeSingle();

  if (!existing || existing.deleted_at) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const now = new Date().toISOString();

  const { error: softDeleteError } = await admin
    .from("clients")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", clientId)
    .is("deleted_at", null);

  if (softDeleteError) {
    return NextResponse.json({ error: softDeleteError.message }, { status: 500 });
  }

  let revokedClientUsers = 0;
  let revokedProjectMembers = 0;
  let revokedInvites = 0;

  if (revokePortal) {
    const { count: userCount } = await admin
      .from("client_users")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    revokedClientUsers = userCount ?? 0;

    await admin
      .from("client_users")
      .delete()
      .eq("client_id", clientId);

    const { data: projectRows } = await admin
      .from("projects")
      .select("id")
      .eq("client_id", clientId);

    const projectIds = (projectRows ?? []).map((row) => String(row.id));

    if (projectIds.length > 0) {
      const { count: memberCount } = await admin
        .from("project_members")
        .select("id", { count: "exact", head: true })
        .in("project_id", projectIds)
        .in("role", ["client_viewer", "client_approver"]);
      revokedProjectMembers = memberCount ?? 0;

      await admin
        .from("project_members")
        .delete()
        .in("project_id", projectIds)
        .in("role", ["client_viewer", "client_approver"]);
    }

    const { count: inviteCount } = await admin
      .from("client_invites")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .is("used_at", null);
    revokedInvites = inviteCount ?? 0;

    await admin
      .from("client_invites")
      .update({ used_at: now })
      .eq("client_id", clientId)
      .is("used_at", null);
  }

  return NextResponse.json({
    ok: true,
    clientId,
    revokePortal,
    revokedClientUsers,
    revokedProjectMembers,
    revokedInvites,
  });
}
