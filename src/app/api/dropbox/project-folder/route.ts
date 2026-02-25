import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveProjectManageAccess } from "@/lib/project-access";
import { createFolder, createSharedLink, refreshAccessToken } from "@/lib/dropbox";

function sanitizeFolderName(value: string) {
  return value
    .replace(/[\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    folderName?: string;
    basePath?: string;
  };

  const projectId = String(body.projectId ?? "").trim();
  const folderName = sanitizeFolderName(String(body.folderName ?? ""));
  const basePath = String(body.basePath ?? "/Beyond Focus/Clientes").trim() || "/Beyond Focus/Clientes";

  if (!projectId || !folderName) {
    return NextResponse.json({ error: "projectId e folderName são obrigatórios" }, { status: 400 });
  }

  const access = await resolveProjectManageAccess(projectId, user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.reason === "not_found" ? "Projeto não encontrado" : "Sem permissão" }, { status: access.reason === "not_found" ? 404 : 403 });
  }

  const admin = createServiceClient();

  const { data: connection } = await admin
    .from("dropbox_connections")
    .select("id, access_token, refresh_token, token_expires_at")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "Liga primeiro a conta Dropbox deste projeto." }, { status: 400 });
  }

  let accessToken = String((connection as { access_token?: string } | null)?.access_token ?? "");
  const refreshToken = String((connection as { refresh_token?: string } | null)?.refresh_token ?? "");
  const tokenExpiresAt = String((connection as { token_expires_at?: string } | null)?.token_expires_at ?? "");

  if (tokenExpiresAt && new Date(tokenExpiresAt).getTime() <= Date.now() && refreshToken) {
    const fresh = await refreshAccessToken(refreshToken);
    accessToken = fresh.access_token;
    await admin
      .from("dropbox_connections")
      .update({
        access_token: fresh.access_token,
        token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
      })
      .eq("id", connection.id as string);
  }

  const normalizedBase = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const fullPath = `${normalizedBase.replace(/\/$/, "")}/${folderName}`;

  let folderId: string | null = null;
  let pathDisplay = fullPath;

  try {
    const created = await createFolder(accessToken, fullPath);
    folderId = created.id;
    pathDisplay = created.path_display;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro a criar pasta";
    if (!/conflict|already exists/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const folderUrl = await createSharedLink(accessToken, pathDisplay);

  const { error: upsertError } = await admin
    .from("project_dropbox")
    .upsert(
      {
        project_id: projectId,
        root_path: pathDisplay,
        base_path: normalizedBase,
        folder_id: folderId,
        folder_url: folderUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    path: pathDisplay,
    folderId,
    folderUrl,
  });
}
