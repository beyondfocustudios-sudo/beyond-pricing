import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { createReviewNotification, logReviewAudit } from "@/lib/review-events";
import { getProjectAccess, getProjectForDeliverable, getProjectForVersion } from "@/lib/review-auth";

type Decision = "approved" | "changes_requested" | "rejected";

function normalizeDecision(input: unknown): Decision {
  const value = String(input ?? "").toLowerCase();
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  return "changes_requested";
}

export async function GET(request: NextRequest) {
  const deliverableId = request.nextUrl.searchParams.get("deliverableId");
  if (!deliverableId) {
    return NextResponse.json({ error: "deliverableId obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const deliverableRef = await getProjectForDeliverable(supabase, deliverableId);
  if (!deliverableRef) {
    return NextResponse.json({ error: "Entregável não encontrado" }, { status: 404 });
  }

  const access = await getProjectAccess(supabase, deliverableRef.project, user.id);
  if (!access.canRead) {
    return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("approvals")
    .select("id, deliverable_id, version_id, deliverable_version_id, decision, approved_by, approver_user_id, approved_at, created_at, note, comment")
    .eq("deliverable_id", deliverableId)
    .order("approved_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ approvals: data ?? [], access });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    deliverableId?: string;
    versionId?: string;
    decision?: Decision;
    note?: string;
  };

  const deliverableId = String(body.deliverableId ?? "").trim();
  const versionId = String(body.versionId ?? "").trim();
  const note = String(body.note ?? "").trim();

  if (!deliverableId || !versionId) {
    return NextResponse.json({ error: "deliverableId e versionId são obrigatórios" }, { status: 400 });
  }

  const decision = normalizeDecision(body.decision);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const [deliverableRef, versionRef] = await Promise.all([
    getProjectForDeliverable(supabase, deliverableId),
    getProjectForVersion(supabase, versionId),
  ]);

  if (!deliverableRef || !versionRef || versionRef.deliverableId !== deliverableId) {
    return NextResponse.json({ error: "Versão/entregável inválidos" }, { status: 404 });
  }

  const access = await getProjectAccess(supabase, deliverableRef.project, user.id);
  if (!access.canApprove) {
    return NextResponse.json({ error: "Sem permissão para aprovar" }, { status: 403 });
  }

  const admin = createServiceClient();
  const now = new Date().toISOString();

  const { data: approval, error } = await admin
    .from("approvals")
    .insert({
      deliverable_id: deliverableId,
      deliverable_version_id: versionId,
      version_id: versionId,
      decision,
      approver_user_id: user.id,
      approved_by: user.id,
      approved_at: now,
      comment: note || null,
      note: note || null,
      created_at: now,
    })
    .select("id, deliverable_id, version_id, deliverable_version_id, decision, approved_by, approver_user_id, approved_at, created_at, note, comment")
    .single();

  if (error || !approval) {
    return NextResponse.json({ error: error?.message ?? "Falha ao registar aprovação" }, { status: 500 });
  }

  const nextStatus = decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "in_review";

  await admin
    .from("deliverables")
    .update({ status: nextStatus, updated_at: now })
    .eq("id", deliverableId);

  const { data: members } = await admin
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", deliverableRef.project.id);

  const notifyRoles = access.isClientUser
    ? ["owner", "admin", "editor", "producer"]
    : ["client_viewer", "client_approver"];

  const recipientUserIds = (members ?? [])
    .filter((member) => notifyRoles.includes(String(member.role)) && member.user_id !== user.id)
    .map((member) => String(member.user_id));

  await createReviewNotification({
    userIds: recipientUserIds,
    type: decision === "approved" ? "approval_done" : "approval_requested",
    payload: {
      project_id: deliverableRef.project.id,
      deliverable_id: deliverableId,
      version_id: versionId,
      decision,
      note,
    },
  });

  await logReviewAudit({
    actorId: user.id,
    action: "review.approval.create",
    entityType: "approvals",
    entityId: approval.id,
    payload: {
      project_id: deliverableRef.project.id,
      deliverable_id: deliverableId,
      version_id: versionId,
      decision,
      note,
    },
  });

  return NextResponse.json({ approval }, { status: 201 });
}
