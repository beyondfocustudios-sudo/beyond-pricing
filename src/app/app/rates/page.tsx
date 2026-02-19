"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { CATEGORIAS, type Rate, type Categoria } from "@/lib/types";
import { Plus, Pencil, Trash2, X, Save } from "lucide-react";

const UNIDADES = ["dia", "hora", "unidade", "verba", "km", "semana"];

interface FormData {
  category: string;
  name: string;
  unit: string;
  base_rate: string;
  min_rate: string;
  notes: string;
}

const emptyForm: FormData = {
  category: "crew",
  name: "",
  unit: "dia",
  base_rate: "",
  min_rate: "",
  notes: "",
};

export default function RatesPage() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState<string>("");

  const loadRates = useCallback(async () => {
    setLoading(true);
    const sb = createClient();
    const { data } = await sb
      .from("rates")
      .select("*")
      .order("category")
      .order("name");
    setRates(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (r: Rate) => {
    setEditId(r.id);
    setForm({
      category: r.category,
      name: r.name,
      unit: r.unit,
      base_rate: String(r.base_rate),
      min_rate: String(r.min_rate),
      notes: r.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const sb = createClient();
    const payload = {
      category: form.category,
      name: form.name.trim(),
      unit: form.unit,
      base_rate: parseFloat(form.base_rate) || 0,
      min_rate: parseFloat(form.min_rate) || 0,
      notes: form.notes.trim() || null,
    };

    let error;
    if (editId) {
      ({ error } = await sb.from("rates").update(payload).eq("id", editId));
    } else {
      ({ error } = await sb.from("rates").insert(payload));
    }

    setSaving(false);
    if (error) {
      alert(`Erro ao guardar: ${error.message}`);
      return;
    }
    setShowForm(false);
    loadRates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tens a certeza que queres apagar esta tarifa?")) return;
    const sb = createClient();
    const { error } = await sb.from("rates").delete().eq("id", id);
    if (error) {
      alert(`Erro ao apagar: ${error.message}`);
      return;
    }
    loadRates();
  };

  const filtered = filtro ? rates.filter((r) => r.category === filtro) : rates;

  const catLabel = (cat: string) =>
    CATEGORIAS.find((c) => c.value === cat)?.label ?? cat;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tarifas</h1>
        <button onClick={openNew} className="btn-primary">
          <Plus className="h-4 w-4" />
          Nova Tarifa
        </button>
      </div>

      {/* Filtro por categoria */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFiltro("")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            filtro === ""
              ? "bg-brand-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Todas
        </button>
        {CATEGORIAS.map((c) => (
          <button
            key={c.value}
            onClick={() => setFiltro(c.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filtro === c.value
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              {editId ? "Editar Tarifa" : "Nova Tarifa"}
            </h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">Categoria</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="input"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Realizador"
                className="input"
              />
            </div>
            <div>
              <label className="label">Unidade</label>
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="input"
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Tarifa Base (&euro;)</label>
              <input
                type="number"
                step="0.01"
                value={form.base_rate}
                onChange={(e) => setForm({ ...form, base_rate: e.target.value })}
                placeholder="0.00"
                className="input"
              />
            </div>
            <div>
              <label className="label">Tarifa Mínima (&euro;)</label>
              <input
                type="number"
                step="0.01"
                value={form.min_rate}
                onChange={(e) => setForm({ ...form, min_rate: e.target.value })}
                placeholder="0.00"
                className="input"
              />
            </div>
            <div>
              <label className="label">Notas</label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Opcional"
                className="input"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn-primary">
              <Save className="h-4 w-4" />
              {saving ? "A guardar…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <p className="text-sm text-gray-500">A carregar…</p>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-gray-500">
          <p>Sem tarifas. Cria a primeira!</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Unidade</th>
                <th className="px-4 py-3 text-right">Base (&euro;)</th>
                <th className="px-4 py-3 text-right">Mín. (&euro;)</th>
                <th className="px-4 py-3">Notas</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{catLabel(r.category)}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-gray-600">{r.unit}</td>
                  <td className="px-4 py-3 text-right">{Number(r.base_rate).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{Number(r.min_rate).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500 truncate max-w[200px]">{r.notes || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(r)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
