import { createClient } from "@supabase/supabase-js";

const TEST_CLIENT_NAME = "Cliente Teste";
const TEST_CLIENT_SLUG = "cliente-teste";
const TEST_CLIENT_EMAIL = "cliente.teste@beyondfoc.us";
const TEST_CLIENT_PASSWORD = "ClienteTeste!2026";
const TEST_PROJECT_NAME = "Teste";

const DEFAULT_INPUTS = {
  itens: [],
  overhead_pct: 15,
  contingencia_pct: 10,
  margem_alvo_pct: 30,
  margem_minima_pct: 15,
  investimento_pct: 0,
  iva_regime: "continental_23",
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

async function listAllUsers(admin: any) {
  let page = 1;
  const perPage = 200;
  const all: Array<{ id: string; email?: string | null }> = [];

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data.users ?? [];
    all.push(...users.map((user: any) => ({ id: user.id, email: user.email })));
    if (users.length < perPage) break;
    page += 1;
  }

  return all;
}

async function run() {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: clientExisting } = await admin
    .from("clients")
    .select("id, deleted_at")
    .eq("slug", TEST_CLIENT_SLUG)
    .maybeSingle();

  let clientId = clientExisting?.id as string | undefined;
  if (!clientId) {
    const { data: insertedClient, error: insertClientError } = await admin
      .from("clients")
      .insert({ name: TEST_CLIENT_NAME, slug: TEST_CLIENT_SLUG })
      .select("id")
      .single();

    if (insertClientError || !insertedClient) {
      throw new Error(insertClientError?.message ?? "Failed to create test client");
    }

    clientId = String(insertedClient.id);
  } else if (clientExisting?.deleted_at) {
    await admin
      .from("clients")
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq("id", clientId);
  }

  const users = await listAllUsers(admin);
  const existingAuthUser = users.find((user) => String(user.email ?? "").toLowerCase() === TEST_CLIENT_EMAIL);

  let clientUserId = existingAuthUser?.id;
  if (!clientUserId) {
    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: TEST_CLIENT_EMAIL,
      password: TEST_CLIENT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: TEST_CLIENT_NAME },
    });

    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message ?? "Failed to create test client auth user");
    }

    clientUserId = createdUser.user.id;
  } else {
    await admin.auth.admin.updateUserById(clientUserId, {
      password: TEST_CLIENT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: TEST_CLIENT_NAME },
    });
  }

  await admin
    .from("client_users")
    .upsert(
      {
        client_id: clientId,
        user_id: clientUserId,
        role: "client_approver",
      },
      { onConflict: "client_id,user_id" },
    );

  const { data: ownerRow } = await admin
    .from("team_members")
    .select("user_id, role")
    .in("role", ["owner", "admin", "member"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const ownerUserId = String(ownerRow?.user_id ?? "").trim();
  if (!ownerUserId) {
    throw new Error("No internal team user available to own project 'Teste'.");
  }

  const { data: projectExisting } = await admin
    .from("projects")
    .select("id")
    .eq("project_name", TEST_PROJECT_NAME)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let projectId = projectExisting?.id as string | undefined;
  if (!projectId) {
    const { data: insertedProject, error: insertProjectError } = await admin
      .from("projects")
      .insert({
        user_id: ownerUserId,
        owner_user_id: ownerUserId,
        project_name: TEST_PROJECT_NAME,
        client_name: TEST_CLIENT_NAME,
        status: "draft",
        inputs: DEFAULT_INPUTS,
      })
      .select("id")
      .single();

    if (insertProjectError || !insertedProject) {
      throw new Error(insertProjectError?.message ?? "Failed to create project 'Teste'");
    }

    projectId = String(insertedProject.id);
  }

  await admin
    .from("projects")
    .update({
      client_id: clientId,
      client_name: TEST_CLIENT_NAME,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  await admin
    .from("project_members")
    .upsert(
      {
        project_id: projectId,
        user_id: ownerUserId,
        role: "owner",
      },
      { onConflict: "project_id,user_id" },
    );

  await admin
    .from("project_members")
    .upsert(
      {
        project_id: projectId,
        user_id: clientUserId,
        role: "client_approver",
      },
      { onConflict: "project_id,user_id" },
    );

  console.log(
    JSON.stringify(
      {
        ok: true,
        client: { id: clientId, name: TEST_CLIENT_NAME, slug: TEST_CLIENT_SLUG },
        auth: { email: TEST_CLIENT_EMAIL, password: TEST_CLIENT_PASSWORD, userId: clientUserId },
        project: { id: projectId, name: TEST_PROJECT_NAME },
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error("[seed-client-teste]", error instanceof Error ? error.message : error);
  process.exit(1);
});
