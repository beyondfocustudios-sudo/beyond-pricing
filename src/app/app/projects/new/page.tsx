"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { DEFAULT_PREFERENCES } from "@/lib/types";

export default function NewProjectPage() {
  const router = useRouter();

  useEffect(() => {
    const create = async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // Try to get user preferences for defaults
      const { data: prefs } = await sb
        .from("preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();

      const defaults = prefs ?? DEFAULT_PREFERENCES;

      const { data, error } = await sb.from("projects").insert({
        user_id: user.id,
        owner_user_id: user.id,   // triggers auto project_member(owner) via migration 017
        project_name: "Novo Projeto",
        client_name: "",
        status: "rascunho",
        inputs: {
          itens: [],
          overhead_pct: defaults.overhead_pct,
          contingencia_pct: defaults.contingencia_pct,
          margem_alvo_pct: defaults.margem_alvo_pct,
          margem_minima_pct: defaults.margem_minima_pct,
          investimento_pct: defaults.investimento_pct,
          iva_regime: defaults.iva_regime,
        },
        calc: {
          custo_crew: 0, custo_equipamento: 0, custo_pos: 0,
          custo_despesas: 0, custo_outro: 0, custo_direto: 0,
          overhead_valor: 0, subtotal_com_overhead: 0,
          contingencia_valor: 0, subtotal_com_contingencia: 0,
          investimento_valor: 0, subtotal_pre_iva: 0, iva_valor: 0,
          preco_recomendado: 0, preco_recomendado_com_iva: 0,
          margem_alvo_valor: 0, preco_minimo: 0, preco_minimo_com_iva: 0,
          margem_minima_valor: 0,
        },
      }).select("id").single();

      if (error || !data) {
        router.push("/app/projects");
        return;
      }
      router.replace(`/app/projects/${data.id}`);
    };
    create();
  }, [router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <svg className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>A criar projeto…</p>
      </div>
    </div>
  );
}
