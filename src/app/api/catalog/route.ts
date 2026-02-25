import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// GET /api/catalog?categoria=crew — list catalog items (global + org)
export async function GET(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const categoria = req.nextUrl.searchParams.get("categoria");

  let query = sb
    .from("catalog_items")
    .select("id, categoria, nome, unidade, preco_base, is_global, ordem")
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (categoria) query = query.eq("categoria", categoria);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST /api/catalog — create custom catalog item for org
export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Get org from team_members
  const { data: tm } = await sb
    .from("team_members")
    .select("org_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!tm?.org_id) return NextResponse.json({ error: "Sem organização" }, { status: 403 });

  const body = await req.json() as {
    categoria: string;
    nome: string;
    unidade?: string;
    preco_base?: number;
  };

  const { data, error } = await sb
    .from("catalog_items")
    .insert({
      org_id: tm.org_id,
      user_id: user.id,
      categoria: body.categoria,
      nome: body.nome,
      unidade: body.unidade ?? "dia",
      preco_base: body.preco_base ?? 0,
      is_global: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data }, { status: 201 });
}
