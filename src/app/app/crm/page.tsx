"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, X, Loader2, Search, Upload, Download,
  User, Building2, Phone, Mail,
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
  { id: "lead",        label: "Lead",        bg: "var(--surface-2)",       border: "var(--border)",        text: "var(--text-2)" },
  { id: "qualified",   label: "Qualificado", bg: "var(--pastel-blue)",     border: "var(--pastel-blue-border)",   text: "var(--pastel-blue-text)" },
  { id: "proposal",    label: "Proposta",    bg: "var(--pastel-amber)",    border: "var(--pastel-amber-border)",  text: "var(--pastel-amber-text)" },
  { id: "negotiation", label: "Negociação",  bg: "var(--pastel-purple)",   border: "var(--pastel-purple-border)", text: "var(--pastel-purple-text)" },
  { id: "won",         label: "Ganho ✓",     bg: "var(--pastel-green)",    border: "var(--pastel-green-border)",  text: "var(--pastel-green-text)" },
  { id: "lost",        label: "Perdido",     bg: "var(--pastel-rose)",     border: "var(--pastel-rose-border)",   text: "var(--pastel-rose-text)" },
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

  const totalPipelineValue = deals.filter(d => !["won","lost"].includes(d.stage)).reduce((s, d) => s + (d.value ?? 0), 0);
  const wonValue = deals.filter(d => d.stage === "won").reduce((s, d) => s + (d.value ?? 0), 0);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--text-3)" }} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">CRM</h1>
          <p className="page-subtitle">{contacts.length} contactos · {deals.length} deals</p>
        </div>
        <div className="flex gap-2">
          {tab === "contacts" && (
            <>
              <label className="btn btn-secondary btn-sm cursor-pointer">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="hidden sm:inline">Importar</span>
                <input type="file" accept=".csv" className="hidden" onChange={importCSV} />
              </label>
              <button onClick={exportCSV} className="btn btn-secondary btn-sm">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar</span>
              </button>
              <button onClick={() => setShowAddContact(o => !o)} className="btn btn-primary btn-sm">
                <Plus className="w-4 h-4" /> Contacto
              </button>
            </>
          )}
          {tab === "pipeline" && (
            <button onClick={() => setShowAddDeal(o => !o)} className="btn btn-primary btn-sm">
              <Plus className="w-4 h-4" /> Deal
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-list">
        {(["contacts", "pipeline"] as CrmTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`tab-trigger ${tab === t ? "active" : ""}`}
          >
            {t === "contacts" ? "Contactos" : "Pipeline"}
          </button>
        ))}
      </div>

      {/* Contacts tab */}
      {tab === "contacts" && (
        <div className="space-y-4">
          {showAddContact && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Novo Contacto</span>
                <button onClick={() => setShowAddContact(false)} className="btn btn-ghost btn-icon-sm">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input value={newContact.name} onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))} placeholder="Nome *" className="input col-span-full md:col-span-1" />
                <input value={newContact.email} onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))} placeholder="Email" type="email" className="input" />
                <input value={newContact.phone} onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))} placeholder="Telefone" className="input" />
                <input value={newContact.company} onChange={e => setNewContact(c => ({ ...c, company: e.target.value }))} placeholder="Empresa" className="input" />
                <input value={newContact.role} onChange={e => setNewContact(c => ({ ...c, role: e.target.value }))} placeholder="Função" className="input col-span-full md:col-span-1" />
              </div>
              <button onClick={addContact} disabled={saving || !newContact.name.trim()} className="btn btn-primary btn-sm">
                {saving ? "A guardar…" : "Guardar"}
              </button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-3)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar contactos…"
              className="input"
              style={{ paddingLeft: "2.25rem" }}
            />
          </div>

          {/* Contact grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredContacts.map(c => (
              <div key={c.id} className="card card-hover">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                    style={{ background: "var(--accent-dim)", color: "var(--accent-2)" }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm" style={{ color: "var(--text)" }}>{c.name}</p>
                    {c.company && (
                      <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--text-3)" }}>
                        <Building2 className="w-3 h-3" />{c.company}
                      </p>
                    )}
                    {c.role && <p className="text-xs" style={{ color: "var(--text-3)" }}>{c.role}</p>}
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-xs transition-colors" style={{ color: "var(--text-3)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
                    >
                      <Mail className="w-3 h-3" />{c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-xs transition-colors" style={{ color: "var(--text-3)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
                    >
                      <Phone className="w-3 h-3" />{c.phone}
                    </a>
                  )}
                </div>
                {(c.tags?.length ?? 0) > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {c.tags?.map(tag => (
                      <span key={tag} className="badge badge-default text-[10px]">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filteredContacts.length === 0 && (
              <div className="col-span-full empty-state">
                <User className="empty-icon" />
                <p className="empty-title">{search ? "Sem resultados" : "Nenhum contacto ainda."}</p>
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
            <div className="card-pastel-blue">
              <p className="text-xs" style={{ color: "var(--pastel-blue-text)", opacity: 0.7 }}>Pipeline</p>
              <p className="text-xl font-bold mt-1" style={{ color: "var(--pastel-blue-text)" }}>€{totalPipelineValue.toLocaleString("pt-PT")}</p>
            </div>
            <div className="card-pastel-green">
              <p className="text-xs" style={{ color: "var(--pastel-green-text)", opacity: 0.7 }}>Ganho</p>
              <p className="text-xl font-bold mt-1" style={{ color: "var(--pastel-green-text)" }}>€{wonValue.toLocaleString("pt-PT")}</p>
            </div>
            <div className="card-pastel-amber">
              <p className="text-xs" style={{ color: "var(--pastel-amber-text)", opacity: 0.7 }}>Deals ativos</p>
              <p className="text-xl font-bold mt-1" style={{ color: "var(--pastel-amber-text)" }}>{deals.filter(d => !["won","lost"].includes(d.stage)).length}</p>
            </div>
            <div className="card">
              <p className="text-xs" style={{ color: "var(--text-3)" }}>Total deals</p>
              <p className="text-xl font-bold mt-1" style={{ color: "var(--text)" }}>{deals.length}</p>
            </div>
          </div>

          {showAddDeal && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Novo Deal</span>
                <button onClick={() => setShowAddDeal(false)} className="btn btn-ghost btn-icon-sm"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input value={newDeal.title} onChange={e => setNewDeal(d => ({ ...d, title: e.target.value }))} placeholder="Título *" className="input col-span-full" />
                <select value={newDeal.stage} onChange={e => setNewDeal(d => ({ ...d, stage: e.target.value }))} className="input">
                  {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <input value={newDeal.value} onChange={e => setNewDeal(d => ({ ...d, value: e.target.value }))} placeholder="Valor (€)" type="number" className="input" />
                <input value={newDeal.probability} onChange={e => setNewDeal(d => ({ ...d, probability: e.target.value }))} placeholder="Probabilidade %" type="number" min="0" max="100" className="input" />
                <textarea value={newDeal.notes} onChange={e => setNewDeal(d => ({ ...d, notes: e.target.value }))} placeholder="Notas" rows={2} className="input col-span-full" />
              </div>
              <button onClick={addDeal} disabled={saving || !newDeal.title.trim()} className="btn btn-primary btn-sm">
                {saving ? "A guardar…" : "Criar deal"}
              </button>
            </div>
          )}

          {/* Kanban pipeline */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {STAGES.map(stage => {
              const stageDeals = deals.filter(d => d.stage === stage.id);
              const stageValue = stageDeals.reduce((s, d) => s + (d.value ?? 0), 0);
              return (
                <div
                  key={stage.id}
                  style={{
                    background: stage.bg,
                    border: `1px solid ${stage.border}`,
                    borderRadius: "var(--r-xl)",
                    padding: "0.75rem",
                    minHeight: "12rem",
                  }}
                >
                  <div className="mb-3">
                    <p className="text-xs font-semibold" style={{ color: stage.text }}>{stage.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: stage.text, opacity: 0.6 }}>
                      €{stageValue.toLocaleString("pt-PT")} · {stageDeals.length}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {stageDeals.map(deal => (
                      <div
                        key={deal.id}
                        className="rounded-xl p-2.5"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                      >
                        <p className="text-xs font-medium line-clamp-2" style={{ color: "var(--text)" }}>{deal.title}</p>
                        {deal.value > 0 && <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>€{deal.value.toLocaleString("pt-PT")}</p>}
                        {deal.contact && <p className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>{deal.contact.name}</p>}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {STAGES.filter(s => s.id !== stage.id).slice(0, 2).map(s => (
                            <button
                              key={s.id}
                              onClick={() => moveStage(deal.id, s.id)}
                              className="text-[10px] px-1.5 py-0.5 rounded-md transition-colors"
                              style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
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
  );
}
