"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Loader2, Calendar, MapPin, Clock,
  Users, Trash2, Edit2, X, ChevronDown, ChevronUp,
  FileText, Phone, Mail,
} from "lucide-react";

interface Person {
  id?: string;
  name: string;
  role: string;
  department?: string;
  phone?: string;
  email?: string;
  call_time?: string;
  notes?: string;
}

interface ScheduleItem {
  id?: string;
  title: string;
  start_time: string;
  end_time?: string;
  department?: string;
  notes?: string;
}

interface CallSheet {
  id: string;
  title: string;
  shoot_date?: string;
  location_name?: string;
  location_address?: string;
  general_call_time?: string;
  notes?: string;
  project_id?: string;
  call_sheet_people?: Person[];
  call_sheet_schedule?: ScheduleItem[];
  created_at: string;
}

export default function CallSheetsPage() {
  const router = useRouter();
  const [sheets, setSheets] = useState<CallSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSheet, setNewSheet] = useState({
    title: "",
    shoot_date: "",
    location_name: "",
    location_address: "",
    general_call_time: "08:00",
    notes: "",
  });
  const [people, setPeople] = useState<Person[]>([{ name: "", role: "", department: "", phone: "", call_time: "" }]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([{ title: "", start_time: "08:00", end_time: "", department: "" }]);
  const [saving, setSaving] = useState(false);

  const loadSheets = useCallback(async () => {
    const res = await fetch("/api/callsheets");
    if (res.ok) setSheets(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadSheets(); }, [loadSheets]);

  const loadDetail = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    const res = await fetch(`/api/callsheets?id=${id}`);
    if (res.ok) {
      const data = await res.json() as CallSheet;
      setSheets(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    }
    setExpandedId(id);
  };

  const create = async () => {
    if (!newSheet.title.trim() || saving) return;
    setSaving(true);
    await fetch("/api/callsheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newSheet,
        people: people.filter(p => p.name.trim()),
        schedule: schedule.filter(s => s.title.trim()),
      }),
    });
    setSaving(false);
    setShowCreate(false);
    setNewSheet({ title: "", shoot_date: "", location_name: "", location_address: "", general_call_time: "08:00", notes: "" });
    setPeople([{ name: "", role: "", department: "", phone: "", call_time: "" }]);
    setSchedule([{ title: "", start_time: "08:00", end_time: "", department: "" }]);
    loadSheets();
  };

  const deleteSheet = async (id: string) => {
    if (!confirm("Eliminar esta call sheet?")) return;
    await fetch(`/api/callsheets?id=${id}`, { method: "DELETE" });
    setSheets(prev => prev.filter(s => s.id !== id));
  };

  const addPerson = () => setPeople(p => [...p, { name: "", role: "", department: "", phone: "", call_time: "" }]);
  const removePerson = (i: number) => setPeople(p => p.filter((_, idx) => idx !== i));
  const updatePerson = (i: number, field: keyof Person, value: string) =>
    setPeople(p => p.map((x, idx) => idx === i ? { ...x, [field]: value } : x));

  const addSchedule = () => setSchedule(s => [...s, { title: "", start_time: "09:00", end_time: "", department: "" }]);
  const removeSchedule = (i: number) => setSchedule(s => s.filter((_, idx) => idx !== i));
  const updateSchedule = (i: number, field: keyof ScheduleItem, value: string) =>
    setSchedule(s => s.map((x, idx) => idx === i ? { ...x, [field]: value } : x));

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--text-3)" }} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Call Sheets</h1>
          <p className="page-subtitle">{sheets.length} call sheet{sheets.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowCreate(o => !o)} className="btn btn-primary btn-sm">
          <Plus className="w-4 h-4" />
          Nova Call Sheet
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Nova Call Sheet</h2>
            <button onClick={() => setShowCreate(false)} className="btn btn-ghost btn-icon-sm">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={newSheet.title}
              onChange={e => setNewSheet(s => ({ ...s, title: e.target.value }))}
              placeholder="Título *"
              className="input col-span-full"
            />
            <input type="date" value={newSheet.shoot_date} onChange={e => setNewSheet(s => ({ ...s, shoot_date: e.target.value }))} className="input" />
            <input type="time" value={newSheet.general_call_time} onChange={e => setNewSheet(s => ({ ...s, general_call_time: e.target.value }))} className="input" />
            <input value={newSheet.location_name} onChange={e => setNewSheet(s => ({ ...s, location_name: e.target.value }))} placeholder="Nome do local" className="input" />
            <input value={newSheet.location_address} onChange={e => setNewSheet(s => ({ ...s, location_address: e.target.value }))} placeholder="Morada" className="input" />
            <textarea
              value={newSheet.notes}
              onChange={e => setNewSheet(s => ({ ...s, notes: e.target.value }))}
              placeholder="Notas gerais"
              rows={2}
              className="input col-span-full"
            />
          </div>

          {/* People */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="section-title">Equipa</span>
              <button onClick={addPerson} className="btn btn-ghost btn-sm" style={{ fontSize: "0.75rem" }}>
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>
            {people.map((p, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-center">
                <input value={p.name} onChange={e => updatePerson(i, "name", e.target.value)} placeholder="Nome" className="input input-sm col-span-2" />
                <input value={p.role} onChange={e => updatePerson(i, "role", e.target.value)} placeholder="Função" className="input input-sm" />
                <input type="time" value={p.call_time ?? ""} onChange={e => updatePerson(i, "call_time", e.target.value)} className="input input-sm" />
                <button onClick={() => removePerson(i)} className="btn btn-ghost btn-icon-sm justify-self-center" style={{ color: "var(--error)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Schedule */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="section-title">Scaletta</span>
              <button onClick={addSchedule} className="btn btn-ghost btn-sm" style={{ fontSize: "0.75rem" }}>
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>
            {schedule.map((s, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-center">
                <input value={s.title} onChange={e => updateSchedule(i, "title", e.target.value)} placeholder="Atividade" className="input input-sm col-span-2" />
                <input type="time" value={s.start_time} onChange={e => updateSchedule(i, "start_time", e.target.value)} className="input input-sm" />
                <input type="time" value={s.end_time ?? ""} onChange={e => updateSchedule(i, "end_time", e.target.value)} className="input input-sm" />
                <button onClick={() => removeSchedule(i)} className="btn btn-ghost btn-icon-sm justify-self-center" style={{ color: "var(--error)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button onClick={create} disabled={saving || !newSheet.title.trim()} className="btn btn-primary w-full">
            {saving ? "A criar…" : "Criar Call Sheet"}
          </button>
        </div>
      )}

      {/* List */}
      {sheets.length === 0 ? (
        <div className="empty-state">
          <FileText className="empty-icon" />
          <p className="empty-title">Nenhuma call sheet ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sheets.map(sheet => (
            <div
              key={sheet.id}
              className="card"
              style={{ padding: 0, overflow: "hidden" }}
            >
              <button
                onClick={() => loadDetail(sheet.id)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
                style={{ background: "transparent" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm" style={{ color: "var(--text)" }}>{sheet.title}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap" style={{ color: "var(--text-3)" }}>
                    {sheet.shoot_date && (
                      <span className="flex items-center gap-1 text-xs">
                        <Calendar className="w-3 h-3" />
                        {new Date(sheet.shoot_date).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" })}
                      </span>
                    )}
                    {sheet.general_call_time && (
                      <span className="flex items-center gap-1 text-xs">
                        <Clock className="w-3 h-3" />
                        Call: {sheet.general_call_time}
                      </span>
                    )}
                    {sheet.location_name && (
                      <span className="flex items-center gap-1 text-xs">
                        <MapPin className="w-3 h-3" />
                        {sheet.location_name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); deleteSheet(sheet.id); }}
                    className="btn btn-ghost btn-icon-sm"
                    style={{ color: "var(--error)" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {expandedId === sheet.id
                    ? <ChevronUp className="w-4 h-4" style={{ color: "var(--text-3)" }} />
                    : <ChevronDown className="w-4 h-4" style={{ color: "var(--text-3)" }} />
                  }
                </div>
              </button>

              {expandedId === sheet.id && (
                <div className="px-5 pb-5 space-y-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                  {sheet.notes && <p className="text-sm" style={{ color: "var(--text-2)" }}>{sheet.notes}</p>}

                  {(sheet.call_sheet_people?.length ?? 0) > 0 && (
                    <div>
                      <p className="section-title mb-2 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Equipa
                      </p>
                      <div className="space-y-1.5">
                        {sheet.call_sheet_people?.map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-sm rounded-xl px-3 py-2"
                            style={{ background: "var(--surface-2)" }}
                          >
                            <div>
                              <span className="font-medium" style={{ color: "var(--text)" }}>{p.name}</span>
                              {p.role && <span className="ml-2 text-xs" style={{ color: "var(--text-3)" }}>{p.role}</span>}
                              {p.department && <span className="ml-2 text-xs" style={{ color: "var(--text-3)" }}>· {p.department}</span>}
                            </div>
                            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-3)" }}>
                              {p.call_time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.call_time}</span>}
                              {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(sheet.call_sheet_schedule?.length ?? 0) > 0 && (
                    <div>
                      <p className="section-title mb-2">Scaletta</p>
                      <div className="space-y-1.5">
                        {sheet.call_sheet_schedule?.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((s, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 text-sm rounded-xl px-3 py-2"
                            style={{ background: "var(--surface-2)" }}
                          >
                            <span className="text-xs w-12 shrink-0" style={{ color: "var(--text-3)" }}>{s.start_time}</span>
                            <span className="flex-1" style={{ color: "var(--text)" }}>{s.title}</span>
                            {s.end_time && <span className="text-xs" style={{ color: "var(--text-3)" }}>{s.end_time}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
