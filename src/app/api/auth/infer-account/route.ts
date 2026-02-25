import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type InferredAccountType = "team" | "client" | "collaborator" | "unknown";

const TEAM_ROLES = new Set(["owner", "admin", "member"]);
const COLLABORATOR_ROLES = new Set(["collaborator", "freelancer"]);

async function findUserIdByEmail(email: string): Promise<string | null> {
  let service;
  try {
    service = createServiceClient();
  } catch {
    return null;
  }

  const perPage = 200;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) return null;

    const match = (data.users ?? []).find(
      (user) => typeof user.email === "string" && user.email.toLowerCase() === email,
    );
    if (match?.id) return match.id;

    if ((data.users?.length ?? 0) < perPage) break;
  }

  return null;
}

async function inferAccountType(email: string): Promise<InferredAccountType> {
  const userId = await findUserIdByEmail(email);
  if (!userId) return "unknown";

  let service;
  try {
    service = createServiceClient();
  } catch {
    return "unknown";
  }

  const { count: clientCount } = await service
    .from("client_users")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((clientCount ?? 0) > 0) return "client";

  const { data: teamRow } = await service
    .from("team_members")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const role = String(teamRow?.role ?? "").toLowerCase();
  if (TEAM_ROLES.has(role)) return "team";

  if (COLLABORATOR_ROLES.has(role)) return "collaborator";

  const { count: memberCount } = await service
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((memberCount ?? 0) > 0) return "collaborator";

  return "unknown";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as { email?: string }));
  const email = String(body?.email ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: true, inferredType: "unknown" as InferredAccountType });
  }

  const inferredType = await inferAccountType(email).catch(() => "unknown" as InferredAccountType);
  return NextResponse.json({
    ok: true,
    inferredType,
  });
}
