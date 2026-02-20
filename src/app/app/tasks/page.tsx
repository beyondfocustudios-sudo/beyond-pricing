"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ListTodo, Plus, Mic, MicOff, ChevronRight, X, AlignLeft } from "lucide-react";

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "todo" | "in_progress" | "done";

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "#6b7280",
  medium: "#3b82f6",
  high: "#f59e0b",
  urgent: "#ef4444",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente",
};

const COLUMNS: { id: Status; label: string; next: Status | null; prev: Status | null }[] = [
  { id: "todo", label: "A Fazer", next: "in_progress", prev: null },
  { id: "in_progress", label: "Em Progresso", next: "done", prev: "todo" },
  { id: "done", label: "Concluído", next: null, prev: "in_progress" },
];

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  status: Status;
  due_date?: string;
  project?: string;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterProject, setFilterProject] = useState<string>("all");
  const [projects, setProjects] = useState<string[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [project, setProject] = useState("");
  const [saving, setSaving] = useState(false);

  const [recording, setRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const [fromTextOpen, setFromTextOpen] = useState(false);
  const [fromText, setFromText] = useState("");
  const [suggestions, setSuggestions] = useState<Task[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechSupported(!!SR);
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json() as { tasks: Task[] };
        const t = data.tasks ?? [];
        setTasks(t);
        const ps = Array.from(new Set(t.map((x) => x.project).filter(Boolean))) as string[];
        setProjects(ps);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const toggleVoice = () => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;
    if (recording) { recognitionRef.current?.stop(); setRecording(false); return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = false; rec.lang = "pt-PT";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      setTitle(e.results[0][0].transcript);
      setRecording(false);
    };
    rec.onerror = () => setRecording(false);
    rec.start();
    recognitionRef.current = rec;
    setRecording(true);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, priority, due_date: dueDate, project }),
      });
      setTitle(""); setDescription(""); setPriority("medium"); setDueDate(""); setProject("");
      setShowForm(false);
      await fetchTasks();
    } finally {
      setSaving(false);
    }
  };

  const moveTask = async (taskId: string, newStatus: Status) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  };

  const handleFromText = async () => {
    if (!fromText.trim()) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/tasks/from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fromText }),
      });
      if (res.ok) {
        const data = await res.json() as { tasks: Task[] };
        setSuggestions(data.tasks ?? []);
      }
    } finally {
      setSuggesting(false);
    }
  };

  const acceptSuggestion = async (t: Task) => {
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    setSuggestions((prev) => prev.filter((s) => s.id !== t.id));
    await fetchTasks();
  };

  const filtered = tasks.filter((t) => filterProject === "all" || t.project === filterProject);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ListTodo className="h-6 w-6" style={{ color: "var(--accent)" }} />
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Tarefas</h1>
            <p className="text-sm" style={{ color: "var(--text-3)" }}>Kanban board</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {projects.length > 0 && (
            <select className="input text-sm py-1.5 px-3 h-auto" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
              <option value="all">Todos projetos</option>
              {projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setFromTextOpen(!fromTextOpen)}>
            <AlignLeft className="h-3.5 w-3.5" /> Do texto
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" /> Nova tarefa
          </button>
        </div>
      </div>

      {fromTextOpen && (
        <div className="card-glass rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Criar tarefas a partir de texto</p>
          <textarea className="input w-full min-h-[80px] resize-y text-sm" placeholder="Cola aqui texto livre ou uma lista..." value={fromText} onChange={(e) => setFromText(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={handleFromText} disabled={suggesting || !fromText.trim()}>
            {suggesting ? "A analisar…" : "Gerar sugestões"}
          </button>
          {suggestions.length > 0 && (
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ background: "var(--surface-2)" }}>
                  <p className="text-sm" style={{ color: "var(--text)" }}>{s.title}</p>
                  <button className="btn btn-primary btn-sm shrink-0" onClick={() => acceptSuggestion(s)}>Aceitar</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="card-glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold" style={{ color: "var(--text)" }}>Nova tarefa</p>
            <button className="btn btn-ghost btn-icon-sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></button>
          </div>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Título da tarefa..." value={title} onChange={(e) => setTitle(e.target.value)} />
            {speechSupported && (
              <button className={`btn btn-sm shrink-0 ${recording ? "btn-primary" : "btn-secondary"}`} onClick={toggleVoice}>
                {recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
          <textarea className="input w-full min-h-[60px] resize-y text-sm" placeholder="Descrição (opcional)..." value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select className="input text-sm" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </select>
            <input className="input text-sm" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <input className="input text-sm col-span-2" placeholder="Projeto..." value={project} onChange={(e) => setProject(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "A guardar…" : "Criar tarefa"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="card-glass rounded-xl h-40 animate-pulse" style={{ background: "var(--surface)" }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const colTasks = filtered.filter((t) => t.status === col.id);
            return (
              <div key={col.id} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>{col.label}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
                    {colTasks.length}
                  </span>
                </div>
                {colTasks.length === 0 && (
                  <div className="card-glass rounded-xl p-6 text-center" style={{ border: "1px dashed var(--border)" }}>
                    <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem tarefas</p>
                  </div>
                )}
                {colTasks.map((task) => {
                  const colDef = COLUMNS.find((c) => c.id === col.id)!;
                  return (
                    <div key={task.id} className="card-glass rounded-xl p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{task.title}</p>
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium shrink-0" style={{ background: PRIORITY_COLORS[task.priority] + "22", color: PRIORITY_COLORS[task.priority] }}>
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                      </div>
                      {task.description && <p className="text-xs" style={{ color: "var(--text-3)" }}>{task.description}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        {task.due_date && <span className="text-xs" style={{ color: "var(--text-3)" }}>{new Date(task.due_date).toLocaleDateString("pt-PT")}</span>}
                        {task.project && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>{task.project}</span>}
                      </div>
                      <div className="flex gap-1.5">
                        {colDef.prev && (
                          <button className="btn btn-ghost btn-sm text-xs flex-1" onClick={() => moveTask(task.id, colDef.prev!)}>
                            ← Recuar
                          </button>
                        )}
                        {colDef.next && (
                          <button className="btn btn-primary btn-sm text-xs flex-1" onClick={() => moveTask(task.id, colDef.next!)}>
                            Avançar <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
