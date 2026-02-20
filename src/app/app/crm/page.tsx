"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, X, Loader2, Search, Upload, Download,
  User, Building2, DollarSign, TrendingUp,
  ChevronRight, Filter, Phone, Mail, Globe,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  tags?: string[];
  notes?: string;
  created_at: string;
}

interface Deal {
  id: string;
  title: string;
  stage: string;
  value: number;
  probability: number;
  expected_close?: string;
  notes?: string;
  contact?: { name: string; email?: string } | null;
  company?: { name: string } | null;
  created_at: string;
}

const STAGES = [
  { id: "lead", label: "Lead", color: "bg-gray-500/20 border-gray-500/30 text-gray-300" },
  { id: "qualified", label: "Qualificado", color: "bg-blue-500/20 border-blue-500/30 text-blue-300" },
  { id: "proposal", label: "Proposta", color: "bg-amber-500/20 border-amber-500/30 text-amber-300" },
  { id: "negotiation", label: "Negociação", color: "bg-purple-500/20 border-purple-500/30 text-purple-300" },
  { id: "won", label: "Ganho ✓", color: "bg-emerald-500/20 border-emerald-500/30 text-emerald-300" },
  { id: "lost", label: "Perdido", color: "bg-rose-500/20 border-rose-500/30 text-rose-300" },
];

type CrmTab = "contacts" | "pipeline";

export default function CrmPage() {
  const [tab, setTab] = useState<CrmTab>("contacts");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", email: "", phone: "", company: "", role: "" });
  const [newDeal, setNewDeal] = useState({ title: "", stage: "lead", value: "", probability: "50", notes: "" });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadContacts = useCallback(async () => {
    const res = await fetch("/api/crm?limit=200");
    if (res.ok) setContacts(await res.json());
  }, []);

  const loadDeals = useCallback(async () => {
    const res = await fetch("/api/crm/deals");
    if (res.ok) setDeals(await res.json());
  }, []);

  useEffect(() => {
    const load = async () => {
      await Promise.all([loadContacts(), loadDeals()]);
      setLoading(false);
    };
    load();
  }, [loadContacts, loadDeals]);

  const addContact = async () => {
    if (!newContact.name.trim() || saving) return;
    setSaving(true);
    await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newContact),
    });
    setSaving(false);
    setShowAddContact(false);
    setNewContact({ name: "", email: "", phone: "", company: "", role: "" });
    loadContacts();
  };

  const addDeal = async () => {
    if (!newDeal.title.trim() || saving) return;
    setSaving(true);
    await fetch("/api/crm/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newDeal, value: parseFloat(newDeal.value) || 0, probability: parseInt(newDeal.probability) || 50 }),
    });
    setSaving(false);
    setShowAddDeal(false);
    setNewDeal({ title: "", stage: "lead", value: "", probability: "50", notes: "" });
    loadDeals();
  };

  const moveStage = async (dealId: string, newStage: string) => {
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: newStage } : d));
    await fetch("/api/crm/deals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dealId, stage: newStage }),
    });
  };

  const exportCSV = () => {
    const rows = [
      ["Nome", "Email", "Telefone", "Empresa", "Função"],
      ...contacts.map(c => [c.name, c.email ?? "", c.phone ?? "", c.company ?? "", c.role ?? ""]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "crm_contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const text = await file.text();
    const lines = text.split("\n").filter(Boolean);
    const headers = lines[0]?.toLowerCase().split(",").map(h => h.trim()) ?? [];
    const records = lines.slice(1).map(line => {
      const vals = line.split(",");
      return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() ?? ""]));
    });
    if (records.length > 0) {
      await fetch("/api/crm/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: records }),
      });
    }
    setImporting(false);
    loadContacts();
    e.target.value = "";
  };

  const filteredContacts = contacts.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.company ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Pipeline stats
  const totalPipelineValue = deals.filter(d => !["won","lost"].includes(d.stage)).reduce((s, d) => s + (d.value ?? 0), 0);
  const wonValue = deals.filter(d => d.stage === "won").reduce((s, d) => s + (d.value ?? 0), 0);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-white/40" />
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">CRM</h1>
            <p className="text-sm text-white/40 mt-0.5">{contacts.length} contactos · {deals.length} deals</p>
          </div>
          <div className="flex gap-2">
            {tab === "contacts" && (
              <>
                <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-sm text-white/70 hover:bg-white/15 cursor-pointer transition-all">
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span className="hidden sm:inline">Importar</span>
                  <input type="file" accept=".csv" className="hidden" onChange={importCSV} />
                </label>
                <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-sm text-white/70 hover:bg-white/15 transition-all">
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Exportar</span>
                </button>
                <button
                  onClick={() => setShowAddContact(o => !o)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-gray-900 text-sm font-semibold hover:bg-white/90 transition-all"
                >
                  <Plus className="w-4 h-4" /> Contacto
                </button>
              </>
            )}
            {tab === "pipeline" && (
              <button
                onClick={() => setShowAddDeal(o => !o)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-gray-900 text-sm font-semibold hover:bg-white/90 transition-all"
              >
                <Plus className="w-4 h-4" /> Deal
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-2xl p-1">
          {(["contacts", "pipeline"] as CrmTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${tab === t ? "bg-white text-gray-900" : "text-white/50 hover:text-white"}`}
            >
              {t === "contacts" ? "Contactos" : "Pipeline"}
            </button>
          ))}
        </div>

        {/* Contacts tab */}
        {tab === "contacts" && (
          <div className="space-y-4">
            {showAddContact && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Novo Contacto</span>
                  <button onClick={() => setShowAddContact(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input value={newContact.name} onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))} placeholder="Nome *" className="px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none" />
                  <input value={newContact.email} onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))} placeholder="Email" type="email" className="px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none" />
                  <input value={newContact.phone} onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))} placeholder="Telefone" className="px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none" />
                  <input value={newContact.company} onChange={e => setNewContact(c => ({ ...c, company: e.target.value }))} placeholder="Empresa" className="px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none" />
                  <input value={newContact.role} onChange={e => setNewContact(c => ({ ...c, role: e.target.value }))} placeholder="Função" className="col-span-full md:col-span-1 px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none" />
                </div>
                <button onClick={addContact} disabled={saving || !newContact.name.trim()} className="px-4 py-2 rounded-xl bg-white text-gray-900 text-sm font-semibold disabled:opacity-50 hover:bg-white/90 transition-all">
                  {saving ? "A guardar…" : "Guardar"}
                </button>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar contactos…"
                className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20"
              />
            </div>

            {/* Contact grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredContacts.map(c => (
                <div key={c.id} className="rounded-2xl bg-white/5 border border-white/8 p-4 hover:bg-white/8 hover:border-white/15 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center text-sm font-semibold text-white/70 shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-white">{c.name}</p>
                      {c.company && <p className="text-xs text-white/50 mt-0.5 flex items-center gap-1"><Building2 className="w-3 h-3" />{c.company}</p>}
                      {c.role && <p className="text-xs text-white/40">{c.role}</p>}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors">
                        <Mail className="w-3 h-3" />{c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors">
                        <Phone className="w-3 h-3" />{c.phone}
                      </a>
                    )}
                  </div>
                  {(c.tags?.length ?? 0) > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {c.tags?.map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/40">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {filteredContacts.length === 0 && (
                <div className="col-span-full text-center py-12 text-white/30">
                  <User className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{search ? "Sem resultados" : "Nenhum contacto ainda."}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pipeline tab */}
        {tab === "pipeline" && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-white/5 border border-white/8 p-4">
                <p className="text-xs text-white/40">Pipeline</p>
                <p className="text-xl font-bold mt-1">€{totalPipelineValue.toLocaleString("pt-PT")}</p>
              </div>
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4">
                <p className="text-xs text-emerald-400/70">Ganho</p>
                <p className="text-xl font-bold mt-1 text-emerald-400">€{wonValue.toLocaleString("pt-PT")}</p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/8 p-4">
                <p className="text-xs text-white/40">Deals ativos</p>
                <p className="text-xl font-bold mt-1">{deals.filter(d => !["won","lost"].includes(d.stage)).length}</p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/8 p-4">
                <p className="text-xs text-white/40">Total deals</p>
                <p className="text-xl font-bold mt-1">{deals.length}</p>
              </div>
            </div>

            {showAddDeal && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Novo Deal</span>
                  <button onClick={() => setShowAddDeal(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input value={newDeal.title} onChange={e => setNewDeal(d => ({ ...d, title: e.target.value }))} placeholder="Título *" className="col-span-full px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none" />
                  <select value={newDeal.stage} onChange={e => setNewDeal(d => ({ ...d, stage: e.target.value }))} className="px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white focus:outline-none">
                    {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <input value={newDeal.value} onChange={e => setNewDeal(d => ({ ...d, value: e.target.value }))} placeholder="Valor (€)" type="number" className="px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none" />
                  <input value={newDeal.probability} onChange={e => setNewDeal(d => ({ ...d, probability: e.target.value }))} placeholder="Probabilidade %" type="number" min="0" max="100" className="px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none" />
                  <textarea value={newDeal.notes} onChange={e => setNewDeal(d => ({ ...d, notes: e.target.value }))} placeholder="Notas" rows={2} className="col-span-full px-3 py-2 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none resize-none" />
                </div>
                <button onClick={addDeal} disabled={saving || !newDeal.title.trim()} className="px-4 py-2 rounded-xl bg-white text-gray-900 text-sm font-semibold disabled:opacity-50 hover:bg-white/90 transition-all">
                  {saving ? "A guardar…" : "Criar deal"}
                </button>
              </div>
            )}

            {/* Kanban pipeline */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 overflow-x-auto">
              {STAGES.map(stage => {
                const stageDeals = deals.filter(d => d.stage === stage.id);
                const stageValue = stageDeals.reduce((s, d) => s + (d.value ?? 0), 0);
                return (
                  <div key={stage.id} className={`rounded-2xl border p-3 min-h-[200px] ${stage.color}`}>
                    <div className="mb-3">
                      <p className="text-xs font-semibold">{stage.label}</p>
                      <p className="text-xs opacity-60 mt-0.5">€{stageValue.toLocaleString("pt-PT")} · {stageDeals.length}</p>
                    </div>
                    <div className="space-y-2">
                      {stageDeals.map(deal => (
                        <div key={deal.id} className="rounded-xl bg-gray-900/60 border border-white/8 p-2.5">
                          <p className="text-xs font-medium text-white/90 line-clamp-2">{deal.title}</p>
                          {deal.value > 0 && <p className="text-xs text-white/50 mt-1">€{deal.value.toLocaleString("pt-PT")}</p>}
                          {deal.contact && <p className="text-[10px] text-white/30 mt-0.5">{deal.contact.name}</p>}
                          {/* Move stage buttons */}
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {STAGES.filter(s => s.id !== stage.id).slice(0, 2).map(s => (
                              <button
                                key={s.id}
                                onClick={() => moveStage(deal.id, s.id)}
                                className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-white/30 hover:text-white/60 transition-all"
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
