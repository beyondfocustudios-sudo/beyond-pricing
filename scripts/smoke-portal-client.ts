import { createClient } from "@supabase/supabase-js";

const TEST_EMAIL = "cliente.teste@beyondfoc.us";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

async function run() {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authUser = (users.data.users ?? []).find((user) => user.email?.toLowerCase() === TEST_EMAIL);
  checks.push({ name: "Auth user Cliente Teste", ok: Boolean(authUser?.id), detail: authUser?.id });

  const { data: client } = await admin.from("clients").select("id,name").eq("slug", "cliente-teste").maybeSingle();
  checks.push({ name: "Client row", ok: Boolean(client?.id), detail: client?.id });

  if (client?.id) {
    const { data: clientUserRows } = await admin.from("client_users").select("id,user_id,role").eq("client_id", client.id);
    checks.push({ name: "client_users membership", ok: (clientUserRows?.length ?? 0) > 0, detail: String(clientUserRows?.length ?? 0) });

    const { data: projects } = await admin
      .from("projects")
      .select("id,project_name")
      .eq("client_id", client.id)
      .is("deleted_at", null)
      .in("project_name", ["Evento Coimbra", "Evento Fátima"]);

    checks.push({ name: "2 projetos atribuídos", ok: (projects?.length ?? 0) >= 2, detail: String(projects?.length ?? 0) });

    const projectIds = (projects ?? []).map((row) => row.id);
    if (projectIds.length > 0) {
      const [deliverables, documentFiles, briefs, milestones, conversations, conversationRows] = await Promise.all([
        admin.from("deliverables").select("id", { count: "exact" }).in("project_id", projectIds),
        admin.from("deliverable_files").select("id", { count: "exact" }).in("project_id", projectIds).eq("filename", "Contrato Inicial.pdf"),
        admin.from("briefs").select("referencias").in("project_id", projectIds),
        admin.from("project_milestones").select("id", { count: "exact" }).in("project_id", projectIds),
        admin.from("conversations").select("id", { count: "exact" }).in("project_id", projectIds),
        admin.from("conversations").select("id").in("project_id", projectIds),
      ]);

      const conversationIds = (conversationRows.data ?? []).map((row) => row.id);
      const messages = conversationIds.length > 0
        ? await admin.from("messages").select("id", { count: "exact" }).in("conversation_id", conversationIds)
        : { count: 0 } as { count: number };

      const hasReference = (briefs.data ?? []).some((row) => Boolean((row as { referencias?: string | null }).referencias));

      checks.push({ name: "deliverables seeded", ok: (deliverables.count ?? 0) > 0, detail: String(deliverables.count ?? 0) });
      checks.push({ name: "documents seeded", ok: (documentFiles.count ?? 0) > 0, detail: String(documentFiles.count ?? 0) });
      checks.push({ name: "references seeded", ok: hasReference, detail: hasReference ? "ok" : "missing" });
      checks.push({ name: "milestones seeded", ok: (milestones.count ?? 0) > 0, detail: String(milestones.count ?? 0) });
      checks.push({ name: "conversation exists", ok: (conversations.count ?? 0) > 0, detail: String(conversations.count ?? 0) });
      checks.push({ name: "messages seeded", ok: (messages.count ?? 0) > 0, detail: String(messages.count ?? 0) });
    }
  }

  let failed = 0;
  for (const check of checks) {
    const marker = check.ok ? "✅" : "❌";
    console.log(`${marker} ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
    if (!check.ok) failed += 1;
  }

  if (failed > 0) {
    console.error(`\nSmoke failed with ${failed} failing checks.`);
    process.exit(1);
  }

  console.log("\n✅ Portal client smoke passed");
}

run().catch((error) => {
  console.error("[smoke-portal-client]", error instanceof Error ? error.message : error);
  process.exit(1);
});
