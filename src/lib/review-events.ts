import { createServiceClient } from "@/lib/supabase/service";

type ReviewAuditInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

export async function createReviewNotification(params: {
  userIds: string[];
  type: "new_message" | "new_file" | "approval_requested" | "approval_done";
  payload: Record<string, unknown>;
}) {
  if (!params.userIds.length) return;
  const admin = createServiceClient();

  const typeToPreference: Record<typeof params.type, "new_comments" | "new_versions" | "approvals"> = {
    new_message: "new_comments",
    new_file: "new_versions",
    approval_requested: "approvals",
    approval_done: "approvals",
  };

  const prefRows = await admin
    .from("user_preferences")
    .select("user_id, notification_prefs")
    .in("user_id", params.userIds);

  const prefsByUser = new Map<string, Record<string, unknown>>();
  for (const row of prefRows.data ?? []) {
    const userId = String((row as { user_id?: string }).user_id ?? "");
    if (!userId) continue;
    const raw = (row as { notification_prefs?: unknown }).notification_prefs;
    prefsByUser.set(userId, raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
  }

  const prefKey = typeToPreference[params.type];
  const rows = params.userIds
    .filter((userId) => {
      const prefs = prefsByUser.get(userId);
      if (!prefs) return true; // default allow when no preference row exists
      const inAppEnabled = prefs.in_app !== false;
      const kindEnabled = prefs[prefKey] !== false;
      return inAppEnabled && kindEnabled;
    })
    .map((userId) => ({
    user_id: userId,
    type: params.type,
    payload: params.payload,
  }));

  if (!rows.length) return;
  await admin.from("notifications").insert(rows);
}

export async function appendEmailOutbox(params: {
  emails: string[];
  template: string;
  payload: Record<string, unknown>;
}) {
  if (!params.emails.length) return;
  const admin = createServiceClient();

  const rows = params.emails.map((email) => ({
    to_email: email,
    template: params.template,
    payload: params.payload,
  }));

  await admin.from("email_outbox").insert(rows);
}

export async function logReviewAudit(entry: ReviewAuditInput) {
  const admin = createServiceClient();

  const candidates: Array<Record<string, unknown>> = [
    {
      actor_id: entry.actorId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      payload: entry.payload ?? {},
    },
    {
      actor_user_id: entry.actorId,
      action: entry.action,
      entity: entry.entityType,
      entity_id: entry.entityId ?? null,
      meta: entry.payload ?? {},
    },
    {
      user_id: entry.actorId,
      action: entry.action,
      table_name: entry.entityType,
      record_id: entry.entityId ?? null,
      new_data: entry.payload ?? {},
    },
  ];

  for (const payload of candidates) {
    const { error } = await admin.from("audit_log").insert(payload);
    if (!error) return;
  }
}
