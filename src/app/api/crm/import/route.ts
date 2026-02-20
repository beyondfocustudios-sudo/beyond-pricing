import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// POST /api/crm/import  body: { contacts: CRMContact[] }
export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { contacts } = await req.json() as { contacts?: Record<string, unknown>[] };
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: "contacts array obrigatório" }, { status: 400 });
  }
  if (contacts.length > 500) {
    return NextResponse.json({ error: "Máximo 500 contactos por importação" }, { status: 400 });
  }

  const rows = contacts.map((c) => ({
    owner_user_id: user.id,
    name: String(c.name ?? "").trim() || "Sem nome",
    email: c.email ? String(c.email).trim() : null,
    phone: c.phone ? String(c.phone).trim() : null,
    company: c.company ? String(c.company).trim() : null,
    notes: c.notes ? String(c.notes).trim() : null,
    tags: Array.isArray(c.tags) ? c.tags : [],
    source: c.source ? String(c.source) : "import",
    custom: (c.custom && typeof c.custom === "object") ? c.custom : {},
  }));

  const { data, error } = await sb.from("crm_contacts").insert(rows).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imported: data?.length ?? 0 }, { status: 201 });
}
