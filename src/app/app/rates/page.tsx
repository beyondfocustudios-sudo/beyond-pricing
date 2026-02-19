"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { CATEGORIAS, type Rate } from "@/lib/types";
import { Plus, Pencil, Trash2, X, Save } from "lucide-react";

const UNIDADES = ["dia", "hora", "unidade", "verba", "km", "semana", "mês"];

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
    const { data } = await sb.from("rates").select("*").order("category").order("name");
    setRates(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadRates(); }, [loadRates]);

  const openNew = () => { setEditId(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (r: Rate) => {
    setEditId(r.id);
    setForm({ category: r.category, name: r.name, unit: r.unit, base_rate: String(r.base_rate), min_rate: String(r.min_rate), notes: r.notes ?? "" });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const sb = createClient();
    const payload = { category: form.category, name: form.name.trim(), unit: form.unit, base_rate: parseFloat(form.base_rate) || 0, min_rate: parseFloat(form.min_rate) || 0, notes: form.notes.trim() || null };
    let error;
    if (editId) { ({ error } = await sb.from("rates").update(payload).eq("id", editId)); }
    else { ({ error } = await sb.from("rates").insert(payload)); }
    setSaving(false);
    if (error) { alert(error.message); return; }
    setShowForm(false);
    loadRates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apagar esta tarifa?")) return;
    const sb = createClient();
    await sb.from("rates").delete().eq("id", id);
    loadRates();
  };

  const filtered = filtro ? rates.filter((r) => r.category === filtro) : rates;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tarifas</h1>
          <p className="page-subtitle">Valores base por categoria e unidade</p>
        </div>
        <button onClick={openNew} className="btn btn-primary">
          <Plus className="h-4 w-4" />
          Nova Tarifa
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFiltro("")} className={`badge ${filtro === "" ? "badge-accent" : "badge-default"} cursor-pointer`}>
          Todas
        </button>
        {CATEGORIAS.map((c) => (
          <button key={c.value} onClick={() => setFiltro(c.value)} className={`badge ${filtro === c.value ? "badge-accent" : "badge-default"} cursor-pointer`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>
                  {editId ? "Editar Tarifa" : "Nova Tarifa"}
                </h2>
                <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-icon-sm">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="label">Categoria</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
                    {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Nome</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Realizador" className="input" autoFocus />
                </div>
                <div>
                  <label className="label">Unidade</label>
                  <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="input">
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Tarifa Base (€)</label>
                  <input type="number" step="0.01" value={form.base_rate} onChange={(e) => setForm({ ...form, base_rate: e.target.value })} placeholder="0.00" className="input" />
                </div>
                <div>
                  <label className="label">Tarifa Mínima (€)</label>
                  <input type="number" step="0.01" value={form.min_rate} onChange={(e) => setForm({ ...form, min_rate: e.target.value })} placeholder="0.00" className="input" />
                </div>
                <div>
                  <label className="label">Notas</label>
                  <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opcional" className="input" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="btn btn-secondary">Cancelar</button>
                <button onClick={handleSave} disabled={saving || !form.name.trim()} className="btn btn-primary">
                  <Save className="h-4 w-4" />
                  {saving ? "A guardar…" : "Guardar"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p className="empty-title">Sem tarifas</p>
            <p className="empty-desc">Cria a primeira tarifa para usar nos orçamentos</p>
            <button onClick={openNew} className="btn btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" />
              Nova Tarifa
            </button>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Nome</th>
                <th>Unidade</th>
                <th className="text-right">Base (€)</th>
                <th className="text-right">Mín. (€)</th>
                <th className="hidden md:table-cell">Notas</th>
                <th style={{ width: "80px" }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const cat = CATEGORIAS.find((c) => c.value === r.category);
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="badge badge-default" style={{ borderColor: "transparent", background: `${cat?.color ?? "#5a6280"}20`, color: cat?.color ?? "var(--text-2)" }}>
                        {cat?.label ?? r.category}
                      </span>
                    </td>
                    <td className="font-medium">{r.name}</td>
                    <td style={{ color: "var(--text-2)" }}>{r.unit}</td>
                    <td className="text-right font-medium">{Number(r.base_rate).toFixed(2)}</td>
                    <td className="text-right" style={{ color: "var(--text-2)" }}>{Number(r.min_rate).toFixed(2)}</td>
                    <td className="hidden md:table-cell" style={{ color: "var(--text-3)", maxWidth: "200px" }}>
                      <span className="truncate block">{r.notes || "—"}</span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(r)} className="btn btn-ghost btn-icon-sm">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="btn btn-ghost btn-icon-sm" style={{ color: "var(--error)" }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
