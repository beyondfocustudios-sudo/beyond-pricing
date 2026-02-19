"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

export default function NewChecklistPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setSaving(true);
    setError("");
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data, error: err } = await sb
      .from("checklists")
      .insert({ user_id: user.id, nome: nome.trim(), project_id: null })
      .select("id")
      .single();

    setSaving(false);
    if (err || !data) { setError(err?.message ?? "Erro ao criar"); return; }
    router.replace(`/app/checklists/${data.id}`);
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/app/checklists" className="btn btn-ghost btn-icon-sm">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="page-title">Nova Checklist</h1>
          <p className="page-subtitle">Cria uma checklist de produção</p>
        </div>
      </div>

      <div className="card">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Nome da checklist</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Campanha Verão 2025"
              className="input"
              autoFocus
            />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="flex gap-3 justify-end">
            <Link href="/app/checklists" className="btn btn-secondary">Cancelar</Link>
            <button type="submit" disabled={saving || !nome.trim()} className="btn btn-primary">
              <Save className="h-4 w-4" />
              {saving ? "A criar…" : "Criar Checklist"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
