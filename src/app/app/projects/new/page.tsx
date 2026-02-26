"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { DEFAULT_PREFERENCES } from "@/lib/types";
import { useMotionConfig } from "@/lib/motion-config";
import { fireCelebration } from "@/lib/celebration";

export default function NewProjectPage() {
  const router = useRouter();
  const { enableCelebrations } = useMotionConfig();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultName = useMemo(() => `Projeto ${new Date().toLocaleDateString("pt-PT")}`, []);
  const [projectName, setProjectName] = useState(defaultName);

  const createProject = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: prefs } = await sb
        .from("preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      const defaults = prefs ?? DEFAULT_PREFERENCES;

      const { data, error: insertError } = await sb.from("projects").insert({
        user_id: user.id,
        owner_user_id: user.id,
        project_name: projectName.trim() || defaultName,
        client_name: "",
        status: "draft",
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
      }).select("id, client_id").single();

      if (insertError || !data) {
        setError(insertError?.message ?? "Não foi possível criar o projeto.");
        setSaving(false);
        return;
      }

      if (data.client_id) {
        void fetch("/api/dropbox/ensure-project-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: data.id }),
        });
      }

      await fireCelebration("project_created", enableCelebrations);
      router.replace(`/app/projects/${data.id}`);
    } catch {
      setError("Não foi possível criar o projeto.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="surface p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>
          Projects
        </p>
        <h1 className="mt-2 page-title">Novo Projeto</h1>
        <p className="page-subtitle">Cria um projeto apenas quando confirmares.</p>
      </section>

      <section className="card p-5 md:p-6 space-y-4">
        <div>
          <label className="label">Nome do projeto</label>
          <input
            className="input"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Ex: Campanha Primavera 2026"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createProject();
              }
            }}
          />
        </div>

        {error ? (
          <p className="text-sm" style={{ color: "var(--error)" }}>
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => void createProject()} disabled={saving}>
            {saving ? "A criar..." : "Criar Projeto"}
          </button>
          <button className="btn btn-secondary" onClick={() => router.push("/app/projects")} disabled={saving}>
            Cancelar
          </button>
        </div>
      </section>
    </div>
  );
}
