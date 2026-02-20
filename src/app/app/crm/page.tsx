"use client";

import { useState, useEffect, useCallback } from "react";
import { Users2, Plus, Search, Upload, Download, X, Edit2 } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  tags: string[];
}

const EMPTY_CONTACT: Omit<Contact, "id"> = {
  name: "", email: "", phone: "", company: "", notes: "", tags: [],
};

export default function CRMPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [allTags, setAllTags] = useState<string[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<Omit<Contact, "id">>(EMPTY_CONTACT);
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm");
      if (res.ok) {
        const data = await res.json() as { contacts: Contact[] };
        const c = data.contacts ?? [];
        setContacts(c);
        const tags = Array.from(new Set(c.flatMap((x) => x.tags)));
        setAllTags(tags);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_CONTACT);
    setTagsInput("");
    setShowModal(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", company: c.company ?? "", notes: c.notes ?? "", tags: c.tags });
    setTagsInput(c.tags.join(", "));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      const payload = { ...form, tags };
      if (editing) {
        await fetch(`/api/crm/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/crm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      await fetchContacts();
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      await fetch("/api/crm/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: importText }),
      });
      setShowImport(false);
      setImportText("");
      await fetchContacts();
    } finally {
      setImporting(false);
    }
  };

  const exportCSV = () => {
    const headers = ["name", "email", "phone", "company", "notes", "tags"];
    const rows = contacts.map((c) => [
      c.name, c.email ?? "", c.phone ?? "", c.company ?? "", c.notes ?? "", c.tags.join(";"),
    ].map((v) => `"${v.replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || (c.company ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q);
    const matchTag = tagFilter === "all" || c.tags.includes(tagFilter);
    return matchSearch && matchTag;
  });

  const field = (key: keyof typeof form, label: string, type = "text") => (
    <div className="space-y-1">
      <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>{label}</label>
      <input
        className="input w-full"
        type={type}
        value={form[key] as string}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users2 className="h-6 w-6" style={{ color: "var(--accent)" }} />
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>CRM</h1>
            <p className="text-sm" style={{ color: "var(--text-3)" }}>Gestão de contactos</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(!showImport)}><Upload className="h-3.5 w-3.5" /> Importar</button>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} disabled={contacts.length === 0}><Download className="h-3.5 w-3.5" /> Exportar</button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus className="h-4 w-4" /> Contacto</button>
        </div>
      </div>

      {showImport && (
        <div className="card-glass rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Importar contactos (CSV ou JSON)</p>
          <textarea className="input w-full min-h-[80px] resize-y text-sm font-mono" placeholder="Cola CSV ou JSON aqui..." value={importText} onChange={(e) => setImportText(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={importing || !importText.trim()}>
            {importing ? "A importar…" : "Importar"}
          </button>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--text-3)" }} />
          <input className="input w-full pl-9" placeholder="Pesquisar contactos..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {allTags.length > 0 && (
          <select className="input text-sm" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="all">Todas as tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="card-glass rounded-xl h-28 animate-pulse" style={{ background: "var(--surface)" }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-glass rounded-xl p-10 text-center space-y-2">
          <Users2 className="h-10 w-10 mx-auto" style={{ color: "var(--text-3)" }} />
          <p style={{ color: "var(--text-2)" }}>{search || tagFilter !== "all" ? "Sem resultados" : "Sem contactos ainda"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className="card-glass rounded-xl p-4 space-y-2 group">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{c.name}</p>
                  {c.company && <p className="text-xs" style={{ color: "var(--text-3)" }}>{c.company}</p>}
                </div>
                <button className="btn btn-ghost btn-icon-sm opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEdit(c)}>
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {c.email && <span className="inline-flex text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent)" + "22", color: "var(--accent)" }}>{c.email}</span>}
                {c.phone && <p className="text-xs" style={{ color: "var(--text-2)" }}>{c.phone}</p>}
              </div>
              {c.notes && <p className="text-xs line-clamp-2" style={{ color: "var(--text-3)" }}>{c.notes}</p>}
              {c.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {c.tags.map((t) => <span key={t} className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>#{t}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="card-glass rounded-2xl p-6 w-full max-w-md space-y-4" style={{ background: "var(--surface)" }}>
            <div className="flex items-center justify-between">
              <p className="font-semibold" style={{ color: "var(--text)" }}>{editing ? "Editar contacto" : "Novo contacto"}</p>
              <button className="btn btn-ghost btn-icon-sm" onClick={() => setShowModal(false)}><X className="h-4 w-4" /></button>
            </div>
            {field("name", "Nome *")}
            {field("email", "Email", "email")}
            {field("phone", "Telefone", "tel")}
            {field("company", "Empresa")}
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Notas</label>
              <textarea className="input w-full min-h-[60px] resize-y text-sm" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Tags (vírgula)</label>
              <input className="input w-full" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-1">
              <button className="btn btn-primary flex-1" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? "A guardar…" : "Guardar"}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
