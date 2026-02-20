"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, X, Loader2, Mic,
  Flag, Calendar, GripVertical,
} from "lucide-react";
import { VoiceButton } from "@/components/VoiceButton";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  due_date?: string;
  position: number;
  assignee_id?: string;
  project_id?: string;
  tags?: string[];
}

const COLUMNS: { id: Task["status"]; label: string; color: string }[] = [
  { id: "todo", label: "A fazer", color: "bg-white/5 border-white/8" },
  { id: "in_progress", label: "Em curso", color: "bg-blue-500/5 border-blue-500/15" },
  { id: "done", label: "Concluído", color: "bg-emerald-500/5 border-emerald-500/15" },
];

const PRIORITY_COLORS = {
  low: "text-white/30",
  medium: "text-amber-400",
  high: "text-orange-400",
  urgent: "text-rose-400",
};

const PRIORITY_LABELS = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState<Task["status"] | null>(null);
  const [newTask, setNewTask] = useState({ title: "", description: "", priority: "medium" as Task["priority"], due_date: "" });
  const [saving, setSaving] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [parseText, setParseText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Task["status"] | null>(null);

  const loadTasks = useCallback(async () => {
    const res = await fetch("/api/tasks?limit=200");
    if (res.ok) {
      const data = await res.json() as Task[];
      setTasks(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const addTask = async () => {
    if (!newTask.title.trim() || saving) return;
    setSaving(true);
    const colTasks = tasks.filter(t => t.status === (showAdd ?? "todo"));
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTask.title,
        description: newTask.description,
        status: showAdd ?? "todo",
        priority: newTask.priority,
        due_date: newTask.due_date || null,
        position: colTasks.length,
      }),
    });
    setNewTask({ title: "", description: "", priority: "medium", due_date: "" });
    setShowAdd(null);
    setSaving(false);
    loadTasks();
  };

  const moveTask = async (taskId: string, newStatus: Task["status"]) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status: newStatus }),
    });
  };

  const deleteTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE" });
  };

  const parseFromText = async () => {
    if (!parseText.trim() || parsing) return;
    setParsing(true);
    const res = await fetch("/api/tasks/from-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: parseText }),
    });
    if (res.ok) {
      const { tasks: newTasks } = await res.json() as { tasks: Array<{ title: string; priority?: string }> };
      for (const t of newTasks) {
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: t.title, status: "todo", priority: t.priority ?? "medium", position: 0 }),
        });
      }
      setParseText("");
      setVoiceOpen(false);
      loadTasks();
    }
    setParsing(false);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, col: Task["status"]) => {
    e.preventDefault();
    setDragOverCol(col);
  };
  const handleDrop = (e: React.DragEvent, col: Task["status"]) => {
    e.preventDefault();
    if (draggedId) moveTask(draggedId, col);
    setDraggedId(null);
    setDragOverCol(null);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-white/40" />
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Tarefas</h1>
            <p className="text-sm text-white/40 mt-0.5">{tasks.length} tarefa{tasks.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => setVoiceOpen(o => !o)}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/15 text-sm font-medium transition-all"
          >
            <Mic className="w-4 h-4" />
            Ditar tarefas
          </button>
        </div>

        {/* Voice / parse panel */}
        {voiceOpen && (
          <div className="mb-6 rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
            <p className="text-sm text-white/60">Dita ou escreve as tuas tarefas — uma por linha.</p>
            <VoiceButton
              onInsert={text => setParseText(t => t ? t + " " + text : text)}
            />
            <textarea
              value={parseText}
              onChange={e => setParseText(e.target.value)}
              placeholder={"Exemplo: Editar vídeo de Lisboa\nEnviar orçamento ao cliente\nPreparar call sheet"}
              rows={4}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none resize-none"
            />
            <button
              onClick={parseFromText}
              disabled={parsing || !parseText.trim()}
              className="px-4 py-2 rounded-xl bg-white text-gray-900 text-sm font-semibold disabled:opacity-50 hover:bg-white/90 transition-all"
            >
              {parsing ? "A processar…" : "Criar tarefas"}
            </button>
          </div>
        )}

        {/* Kanban columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const colTasks = tasks
              .filter(t => t.status === col.id)
              .sort((a, b) => a.position - b.position);

            return (
              <div
                key={col.id}
                onDragOver={e => handleDragOver(e, col.id)}
                onDrop={e => handleDrop(e, col.id)}
                className={`rounded-2xl border p-4 min-h-[300px] transition-colors ${col.color} ${dragOverCol === col.id ? "ring-2 ring-white/30" : ""}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white/80">{col.label}</span>
                    <span className="text-xs text-white/40 bg-white/8 rounded-full px-2 py-0.5">{colTasks.length}</span>
                  </div>
                  <button
                    onClick={() => setShowAdd(col.id)}
                    className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Add task form */}
                {showAdd === col.id && (
                  <div className="mb-3 rounded-xl bg-white/8 border border-white/15 p-3 space-y-2">
                    <input
                      autoFocus
                      value={newTask.title}
                      onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") addTask(); if (e.key === "Escape") setShowAdd(null); }}
                      placeholder="Título da tarefa…"
                      className="w-full bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newTask.priority}
                        onChange={e => setNewTask(n => ({ ...n, priority: e.target.value as Task["priority"] }))}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={newTask.due_date}
                        onChange={e => setNewTask(n => ({ ...n, due_date: e.target.value }))}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addTask} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-white text-gray-900 text-xs font-semibold disabled:opacity-50">
                        {saving ? "…" : "Adicionar"}
                      </button>
                      <button onClick={() => setShowAdd(null)} className="px-2 py-1.5 rounded-lg bg-white/10 text-white/60 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Task cards */}
                <div className="space-y-2">
                  {colTasks.map(task => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={e => handleDragStart(e, task.id)}
                      className={`group rounded-xl bg-gray-900/60 border border-white/8 p-3 cursor-grab active:cursor-grabbing hover:border-white/15 transition-all ${draggedId === task.id ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-3.5 h-3.5 text-white/20 mt-0.5 shrink-0 group-hover:text-white/40" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/90 leading-snug">{task.title}</p>
                          {task.description && <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{task.description}</p>}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className={`text-xs ${PRIORITY_COLORS[task.priority]}`}>
                              <Flag className="w-3 h-3 inline mr-0.5" />
                              {PRIORITY_LABELS[task.priority]}
                            </span>
                            {task.due_date && (
                              <span className="text-xs text-white/40 flex items-center gap-0.5">
                                <Calendar className="w-3 h-3" />
                                {new Date(task.due_date).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-rose-500/20 text-white/30 hover:text-rose-400 transition-all shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
