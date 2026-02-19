// ============================================================
// POST /api/admin/create-user
// ============================================================
// Creates a new Supabase Auth user + links to client_users.
// Uses the SERVICE_ROLE key (server-only) so the anon client
// never has admin privileges. Only accessible to authenticated
// internal team members (owner/admin role check via authz).
//
// Body: { email, password, clientId, role }
// Returns: { userId } on success, { error } on failure.
// ============================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  // ── 1. Authenticate the caller (must be an internal team member) ──
  const sb = await createServerClient();
  const {
    data: { user: caller },
  } = await sb.auth.getUser();

  if (!caller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // ── 2. Verify caller is internal (not a portal client) ────────────
  // Check that the calling user is NOT a client_user (i.e. is team)
  const { data: clientUser } = await sb
    .from("client_users")
    .select("id")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (clientUser) {
    return NextResponse.json(
      { error: "Acesso negado. Apenas membros da equipa podem criar utilizadores." },
      { status: 403 }
    );
  }

  // ── 3. Parse and validate body ────────────────────────────────────
  let body: { email?: string; password?: string; clientId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const { email, password, clientId, role } = body;

  if (!email || !password || !clientId || !role) {
    return NextResponse.json(
      { error: "Campos obrigatórios: email, password, clientId, role." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password deve ter pelo menos 8 caracteres." },
      { status: 400 }
    );
  }

  const validRoles = ["client_viewer", "client_approver"];
  if (!validRoles.includes(role)) {
    return NextResponse.json(
      { error: `Role inválido. Use: ${validRoles.join(", ")}` },
      { status: 400 }
    );
  }

  // ── 4. Verify clientId exists ─────────────────────────────────────
  const { data: client } = await sb
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  // ── 5. Create user via Admin API (service role) ───────────────────
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    console.error("[create-user] Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL");
    return NextResponse.json(
      { error: "Configuração de servidor incompleta. Contacta o administrador." },
      { status: 500 }
    );
  }

  // Validate URL format — must be https://...supabase.co
  const supabaseApiUrl = supabaseUrl;
  if (!supabaseApiUrl.startsWith("http")) {
    return NextResponse.json(
      { error: "SUPABASE_URL inválido no servidor. Contacta o administrador." },
      { status: 500 }
    );
  }

  const adminClient = createAdminClient(supabaseApiUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email confirmation — admin-created users are pre-verified
  });

  if (createErr || !newUser.user) {
    console.error("[create-user] createUser error:", createErr?.message);
    // Surface friendly errors
    const msg =
      createErr?.message?.includes("already registered") ||
      createErr?.message?.includes("already been registered")
        ? "Este email já está registado."
        : createErr?.message ?? "Erro ao criar utilizador.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // ── 6. Link user to client_users ─────────────────────────────────
  const { error: linkErr } = await adminClient
    .from("client_users")
    .insert({
      client_id: clientId,
      user_id: newUser.user.id,
      role,
    });

  if (linkErr) {
    console.error("[create-user] link error:", linkErr.message);
    // Rollback: delete the auth user we just created
    await adminClient.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json(
      { error: "Erro ao associar utilizador ao cliente. Tenta novamente." },
      { status: 500 }
    );
  }

  return NextResponse.json({ userId: newUser.user.id }, { status: 201 });
}
