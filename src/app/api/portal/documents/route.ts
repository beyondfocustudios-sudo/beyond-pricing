import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectAccess } from "@/lib/authz";

type GenericRow = Record<string, unknown>;

function coerceString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function mapDocumentRow(row: GenericRow, projectId: string) {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    project_id: coerceString(row.project_id) || projectId,
    title: coerceString(row.title) || coerceString(row.name) || "Documento",
    status: coerceString(row.status) || coerceString(row.state),
    type: coerceString(row.type) || coerceString(row.document_type) || coerceString(row.file_type),
    url:
      coerceString(row.url)
      || coerceString(row.file_url)
      || coerceString(row.document_url)
      || coerceString(row.link_url)
      || coerceString(row.dropbox_url),
    created_at: coerceString(row.created_at) || coerceString(row.updated_at),
  };
}

async function queryRows(projectId: string, table: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("project_id", projectId)
    .limit(80);
  if (error) return null;
  if (!Array.isArray(data)) return [];
  return data as GenericRow[];
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  try {
    await requireProjectAccess(projectId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await queryRows(projectId, "project_documents")
    ?? await queryRows(projectId, "documents")
    ?? [];

  return NextResponse.json({
    documents: rows.map((row) => mapDocumentRow(row, projectId)),
  });
}
