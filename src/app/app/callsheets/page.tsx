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
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-white/40" />
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Call Sheets</h1>
            <p className="text-sm text-white/40 mt-0.5">{sheets.length} call sheet{sheets.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => setShowCreate(o => !o)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white text-gray-900 text-sm font-semibold hover:bg-white/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            Nova Call Sheet
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mb-6 rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Nova Call Sheet</h2>
              <button onClick={() => setShowCreate(false)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={newSheet.title}
                onChange={e => setNewSheet(s => ({ ...s, title: e.target.value }))}
                placeholder="Título *"
                className="px-3 py-2.5 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none col-span-full"
              />
              <input
                type="date"
                value={newSheet.shoot_date}
                onChange={e => setNewSheet(s => ({ ...s, shoot_date: e.target.value }))}
                className="px-3 py-2.5 rounded-xl bg-white/8 border border-white/10 text-sm text-white focus:outline-none"
              />
              <input
                type="time"
                value={newSheet.general_call_time}
                onChange={e => setNewSheet(s => ({ ...s, general_call_time: e.target.value }))}
                className="px-3 py-2.5 rounded-xl bg-white/8 border border-white/10 text-sm text-white focus:outline-none"
              />
              <input
                value={newSheet.location_name}
                onChange={e => setNewSheet(s => ({ ...s, location_name: e.target.value }))}
                placeholder="Nome do local"
                className="px-3 py-2.5 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none"
              />
              <input
                value={newSheet.location_address}
                onChange={e => setNewSheet(s => ({ ...s, location_address: e.target.value }))}
                placeholder="Morada"
                className="px-3 py-2.5 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none"
              />
              <textarea
                value={newSheet.notes}
                onChange={e => setNewSheet(s => ({ ...s, notes: e.target.value }))}
                placeholder="Notas gerais"
                rows={2}
                className="px-3 py-2.5 rounded-xl bg-white/8 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none resize-none col-span-full"
              />
            </div>

            {/* People */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Equipa</span>
                <button onClick={addPerson} className="text-xs text-white/40 hover:text-white flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Adicionar
                </button>
              </div>
              {people.map((p, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-center">
                  <input value={p.name} onChange={e => updatePerson(i, "name", e.target.value)} placeholder="Nome" className="col-span-2 px-2 py-1.5 rounded-lg bg-white/5 border border-white/8 text-xs text-white placeholder-white/25 focus:outline-none" />
                  <input value={p.role} onChange={e => updatePerson(i, "role", e.target.value)} placeholder="Função" className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/8 text-xs text-white placeholder-white/25 focus:outline-none" />
                  <input type="time" value={p.call_time ?? ""} onChange={e => updatePerson(i, "call_time", e.target.value)} className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/8 text-xs text-white focus:outline-none" />
                  <button onClick={() => removePerson(i)} className="text-white/30 hover:text-rose-400 transition-colors justify-self-center"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>

            {/* Schedule */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Scaletta</span>
                <button onClick={addSchedule} className="text-xs text-white/40 hover:text-white flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Adicionar
                </button>
              </div>
              {schedule.map((s, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-center">
                  <input value={s.title} onChange={e => updateSchedule(i, "title", e.target.value)} placeholder="Atividade" className="col-span-2 px-2 py-1.5 rounded-lg bg-white/5 border border-white/8 text-xs text-white placeholder-white/25 focus:outline-none" />
                  <input type="time" value={s.start_time} onChange={e => updateSchedule(i, "start_time", e.target.value)} className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/8 text-xs text-white focus:outline-none" />
                  <input type="time" value={s.end_time ?? ""} onChange={e => updateSchedule(i, "end_time", e.target.value)} className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/8 text-xs text-white focus:outline-none" />
                  <button onClick={() => removeSchedule(i)} className="text-white/30 hover:text-rose-400 transition-colors justify-self-center"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>

            <button
              onClick={create}
              disabled={saving || !newSheet.title.trim()}
              className="w-full py-3 rounded-xl bg-white text-gray-900 text-sm font-semibold disabled:opacity-50 hover:bg-white/90 transition-all"
            >
              {saving ? "A criar…" : "Criar Call Sheet"}
            </button>
          </div>
        )}

        {/* List */}
        {sheets.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma call sheet ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sheets.map(sheet => (
              <div key={sheet.id} className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                <button
                  onClick={() => loadDetail(sheet.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-white">{sheet.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-white/40 flex-wrap">
                      {sheet.shoot_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(sheet.shoot_date).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" })}
                        </span>
                      )}
                      {sheet.general_call_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Call: {sheet.general_call_time}
                        </span>
                      )}
                      {sheet.location_name && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {sheet.location_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); deleteSheet(sheet.id); }}
                      className="p-1.5 rounded-lg hover:bg-rose-500/20 text-white/30 hover:text-rose-400 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {expandedId === sheet.id ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
                  </div>
                </button>

                {expandedId === sheet.id && (
                  <div className="px-5 pb-5 border-t border-white/8 space-y-4 pt-4">
                    {sheet.notes && <p className="text-sm text-white/60">{sheet.notes}</p>}

                    {(sheet.call_sheet_people?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" /> Equipa
                        </p>
                        <div className="space-y-1.5">
                          {sheet.call_sheet_people?.map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-sm rounded-xl bg-white/5 px-3 py-2">
                              <div>
                                <span className="text-white/90 font-medium">{p.name}</span>
                                {p.role && <span className="text-white/40 ml-2 text-xs">{p.role}</span>}
                                {p.department && <span className="text-white/30 ml-2 text-xs">· {p.department}</span>}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-white/40">
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
                        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Scaletta</p>
                        <div className="space-y-1.5">
                          {sheet.call_sheet_schedule?.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((s, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm rounded-xl bg-white/5 px-3 py-2">
                              <span className="text-white/40 text-xs w-12 shrink-0">{s.start_time}</span>
                              <span className="text-white/90 flex-1">{s.title}</span>
                              {s.end_time && <span className="text-white/30 text-xs">{s.end_time}</span>}
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
    </div>
  );
}
