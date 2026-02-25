import { createClient } from "@supabase/supabase-js";

const TEST_CLIENT_NAME = "Cliente Teste";
const TEST_CLIENT_SLUG = "cliente-teste";
const TEST_CLIENT_EMAIL = "cliente.teste@beyondfoc.us";
const TEST_CLIENT_PASSWORD = "Bt!Portal2026#Client";
const TEST_PROJECTS = ["Evento Coimbra", "Evento Fátima"];

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
  if (!value) throw new Error(`Missing environment variable: ${name}`);
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

async function ensureClient(admin: any) {
  const { data: existing } = await admin
    .from("clients")
    .select("id, deleted_at")
    .eq("slug", TEST_CLIENT_SLUG)
    .maybeSingle();

  let clientId = existing?.id as string | undefined;
  if (!clientId) {
    const { data: inserted, error } = await admin
      .from("clients")
      .insert({ name: TEST_CLIENT_NAME, slug: TEST_CLIENT_SLUG })
      .select("id")
      .single();

    if (error || !inserted) throw new Error(error?.message ?? "Failed to create test client");
    clientId = String(inserted.id);
  } else if (existing?.deleted_at) {
    await admin.from("clients").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("id", clientId);
  }

  return clientId;
}

async function ensureClientUser(admin: any, clientId: string): Promise<string> {
  const users = await listAllUsers(admin);
  const existingAuthUser = users.find((user) => String(user.email ?? "").toLowerCase() === TEST_CLIENT_EMAIL);

  let userId = existingAuthUser?.id;
  if (!userId) {
    const { data: createdUser, error } = await admin.auth.admin.createUser({
      email: TEST_CLIENT_EMAIL,
      password: TEST_CLIENT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: TEST_CLIENT_NAME },
    });
    if (error || !createdUser.user) throw new Error(error?.message ?? "Failed to create test client auth user");
    userId = createdUser.user.id;
  } else {
    await admin.auth.admin.updateUserById(userId, {
      password: TEST_CLIENT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: TEST_CLIENT_NAME },
    });
  }

  if (!userId) {
    throw new Error("Failed to resolve test client user id");
  }

  await admin.from("client_users").upsert(
    {
      client_id: clientId,
      user_id: userId,
      role: "client_approver",
    },
    { onConflict: "client_id,user_id" },
  );

  return userId;
}

async function ensureOwner(admin: any) {
  const { data } = await admin
    .from("team_members")
    .select("user_id")
    .in("role", ["owner", "admin", "member"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const ownerUserId = String(data?.user_id ?? "").trim();
  if (!ownerUserId) throw new Error("No internal team user available to own seed projects.");
  return ownerUserId;
}

async function ensureProject(admin: any, name: string, clientId: string, ownerUserId: string, clientUserId: string) {
  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("project_name", name)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let projectId = existing?.id as string | undefined;
  if (!projectId) {
    const { data: inserted, error } = await admin
      .from("projects")
      .insert({
        user_id: ownerUserId,
        owner_user_id: ownerUserId,
        project_name: name,
        client_name: TEST_CLIENT_NAME,
        client_id: clientId,
        status: "in_review",
        inputs: DEFAULT_INPUTS,
      })
      .select("id")
      .single();

    if (error || !inserted) throw new Error(error?.message ?? `Failed to create project ${name}`);
    projectId = String(inserted.id);
  } else {
    await admin
      .from("projects")
      .update({
        client_id: clientId,
        client_name: TEST_CLIENT_NAME,
        deleted_at: null,
        archived_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);
  }

  await admin.from("project_members").upsert(
    [
      { project_id: projectId, user_id: ownerUserId, role: "owner" },
      { project_id: projectId, user_id: clientUserId, role: "client_approver" },
    ],
    { onConflict: "project_id,user_id" },
  );

  return projectId;
}

async function seedProjectData(admin: any, projectId: string, clientId: string, ownerUserId: string) {
  const now = new Date();

  const { data: deliverable } = await admin
    .from("deliverables")
    .select("id")
    .eq("project_id", projectId)
    .eq("title", "Vídeo Institucional")
    .maybeSingle();

  let deliverableId = deliverable?.id as string | undefined;
  if (!deliverableId) {
    const { data: insertedDeliverable, error } = await admin
      .from("deliverables")
      .insert({
        project_id: projectId,
        title: "Vídeo Institucional",
        description: "Versão inicial para aprovação no portal",
        status: "in_review",
      })
      .select("id")
      .single();

    if (error || !insertedDeliverable) throw new Error(error?.message ?? "Failed to create deliverable");
    deliverableId = String(insertedDeliverable.id);
  }

  const { data: versionExisting } = await admin
    .from("deliverable_versions")
    .select("id")
    .eq("deliverable_id", deliverableId)
    .eq("version_number", 1)
    .maybeSingle();

  if (!versionExisting) {
    await admin.from("deliverable_versions").insert({
      deliverable_id: deliverableId,
      version: 1,
      version_number: 1,
      file_url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      file_type: "video/mp4",
      notes: "V1 placeholder",
      created_by: ownerUserId,
      uploaded_by: ownerUserId,
      published_at: now.toISOString(),
    });
  }

  const { data: docFileExisting } = await admin
    .from("deliverable_files")
    .select("id")
    .eq("project_id", projectId)
    .eq("filename", "Contrato Inicial.pdf")
    .maybeSingle();

  if (!docFileExisting) {
    const primaryDocumentInsert = await admin.from("deliverable_files").insert({
      project_id: projectId,
      deliverable_id: deliverableId,
      filename: "Contrato Inicial.pdf",
      ext: "pdf",
      file_type: "document",
      collection: "documents",
      dropbox_path: `/Beyond Focus/Clientes/${TEST_CLIENT_NAME}/${projectId}/Contrato Inicial.pdf`,
      mime: "application/pdf",
      shared_link: "https://example.com/docs/contrato-inicial.pdf",
      preview_url: "https://example.com/docs/contrato-inicial.pdf",
      bytes: 120000,
      captured_at: now.toISOString(),
    });

    if (primaryDocumentInsert.error) {
      await admin.from("deliverable_files").insert({
        project_id: projectId,
        deliverable_id: deliverableId,
        filename: "Contrato Inicial.pdf",
        ext: "pdf",
        collection: "documents",
        dropbox_path: `/Beyond Focus/Clientes/${TEST_CLIENT_NAME}/${projectId}/Contrato Inicial.pdf`,
        shared_link: "https://example.com/docs/contrato-inicial.pdf",
        bytes: 120000,
        captured_at: now.toISOString(),
      });
    }
  }

  const referenceUrls = [
    "https://vimeo.com/76979871",
    "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  ];

  await admin.from("briefs").upsert(
    {
      project_id: projectId,
      user_id: ownerUserId,
      referencias: referenceUrls.join("\n"),
      observacoes: "Moodboard base para direção criativa.",
    },
    { onConflict: "project_id" },
  );

  const milestones = [
    { title: "Kickoff", due: new Date(now.getTime() + 2 * 86400000), phase: "pre_producao" },
    { title: "Entrega V1", due: new Date(now.getTime() + 7 * 86400000), phase: "rodagem" },
  ];

  for (const milestone of milestones) {
    const { data: existingMilestone } = await admin
      .from("project_milestones")
      .select("id")
      .eq("project_id", projectId)
      .eq("title", milestone.title)
      .maybeSingle();

    if (!existingMilestone) {
      const primaryInsert = await admin.from("project_milestones").insert({
        project_id: projectId,
        title: milestone.title,
        phase: milestone.phase,
        status: "pending",
        progress_percent: 0,
        due_date: milestone.due.toISOString().slice(0, 10),
        created_by: ownerUserId,
      });

      if (primaryInsert.error) {
        await admin.from("project_milestones").insert({
          project_id: projectId,
          title: milestone.title,
          phase: milestone.phase,
          status: "pending",
          due_date: milestone.due.toISOString().slice(0, 10),
        });
      }
    }
  }

  const { data: conversation } = await admin
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)
    .eq("client_id", clientId)
    .maybeSingle();

  let conversationId = conversation?.id as string | undefined;
  if (!conversationId) {
    const { data: insertedConversation, error } = await admin
      .from("conversations")
      .insert({ project_id: projectId, client_id: clientId })
      .select("id")
      .single();

    if (error || !insertedConversation) throw new Error(error?.message ?? "Failed to create conversation");
    conversationId = String(insertedConversation.id);
  }

  const { data: existingMessage } = await admin
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .limit(1)
    .maybeSingle();

  if (!existingMessage) {
    await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_type: "team",
      sender_user_id: ownerUserId,
      body: "Bem-vindo ao portal. Já podes rever a primeira versão e deixar feedback.",
    });
  }
}

async function run() {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const clientId = await ensureClient(admin);
  const clientUserId = await ensureClientUser(admin, clientId);
  const ownerUserId = await ensureOwner(admin);

  const projectIds: string[] = [];
  for (const projectName of TEST_PROJECTS) {
    const projectId = await ensureProject(admin, projectName, clientId, ownerUserId, clientUserId);
    projectIds.push(projectId);
  }

  for (const projectId of projectIds) {
    await seedProjectData(admin, projectId, clientId, ownerUserId);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        client: { id: clientId, name: TEST_CLIENT_NAME, slug: TEST_CLIENT_SLUG },
        auth: { email: TEST_CLIENT_EMAIL, password: TEST_CLIENT_PASSWORD, userId: clientUserId },
        projects: projectIds.map((id, index) => ({ id, name: TEST_PROJECTS[index] })),
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
