"use client";

import React, { useEffect, useState, useCallback } from "react";
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

const COLUMNS: { id: Task["status"]; label: string }[] = [
  { id: "todo", label: "A fazer" },
  { id: "in_progress", label: "Em curso" },
  { id: "done", label: "Concluído" },
];

const PRIORITY_COLORS: Record<Task["priority"], string> = {
  low: "var(--text-3)",
  medium: "var(--warning)",
  high: "#f97316",
  urgent: "var(--error)",
};

const PRIORITY_LABELS: Record<Task["priority"], string> = {
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
  const [swipeX, setSwipeX] = useState<Record<string, number>>({});
  const touchStartX = React.useRef<Record<string, number>>({});

  const loadTasks = useCallback(async () => {
    const res = await fetch("/api/tasks?limit=200");
    if (res.ok) {
      const data = await res.json() as { tasks?: Task[] };
      setTasks(data.tasks ?? []);
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

  // Swipe-to-delete (mobile)
  const handleTouchStart = (id: string, e: React.TouchEvent) => {
    touchStartX.current[id] = e.touches[0].clientX;
  };
  const handleTouchMove = (id: string, e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - (touchStartX.current[id] ?? e.touches[0].clientX);
    if (dx < 0) setSwipeX((prev) => ({ ...prev, [id]: Math.max(dx, -80) }));
  };
  const handleTouchEnd = (id: string) => {
    const dx = swipeX[id] ?? 0;
    if (dx <= -60) {
      deleteTask(id);
    }
    setSwipeX((prev) => ({ ...prev, [id]: 0 }));
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
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--text-3)" }} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Tarefas</h1>
          <p className="page-subtitle">{tasks.length} tarefa{tasks.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setVoiceOpen(o => !o)}
          className="btn btn-secondary btn-sm"
        >
          <Mic className="w-4 h-4" />
          Ditar tarefas
        </button>
      </div>

      {/* Voice / parse panel */}
      {voiceOpen && (
        <div className="card space-y-3">
          <p className="text-sm" style={{ color: "var(--text-2)" }}>Dita ou escreve as tuas tarefas — uma por linha.</p>
          <VoiceButton
            onInsert={text => setParseText(t => t ? t + " " + text : text)}
          />
          <textarea
            value={parseText}
            onChange={e => setParseText(e.target.value)}
            placeholder={"Exemplo: Editar vídeo de Lisboa\nEnviar orçamento ao cliente\nPreparar call sheet"}
            rows={4}
            className="input w-full"
          />
          <button
            onClick={parseFromText}
            disabled={parsing || !parseText.trim()}
            className="btn btn-primary btn-sm"
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

          const colBg = col.id === "in_progress"
            ? "var(--pastel-blue)"
            : col.id === "done"
            ? "var(--pastel-green)"
            : "var(--surface-2)";
          const colBorder = col.id === "in_progress"
            ? "var(--pastel-blue-border)"
            : col.id === "done"
            ? "var(--pastel-green-border)"
            : "var(--border)";

          return (
            <div
              key={col.id}
              onDragOver={e => handleDragOver(e, col.id)}
              onDrop={e => handleDrop(e, col.id)}
              style={{
                background: colBg,
                border: `1px solid ${colBorder}`,
                borderRadius: "var(--r-xl)",
                padding: "1rem",
                minHeight: "18rem",
                transition: "box-shadow 0.15s",
                boxShadow: dragOverCol === col.id ? "0 0 0 2px var(--accent)" : undefined,
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{col.label}</span>
                  <span
                    className="text-xs rounded-full px-2 py-0.5"
                    style={{ background: "var(--surface)", color: "var(--text-3)" }}
                  >
                    {colTasks.length}
                  </span>
                </div>
                <button
                  onClick={() => setShowAdd(col.id)}
                  className="btn btn-ghost btn-icon-sm"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Add task form */}
              {showAdd === col.id && (
                <div className="mb-3 rounded-xl p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border-2)" }}>
                  <input
                    autoFocus
                    value={newTask.title}
                    onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") addTask(); if (e.key === "Escape") setShowAdd(null); }}
                    placeholder="Título da tarefa…"
                    className="w-full bg-transparent text-sm focus:outline-none"
                    style={{ color: "var(--text)" }}
                  />
                  <div className="flex gap-2">
                    <select
                      value={newTask.priority}
                      onChange={e => setNewTask(n => ({ ...n, priority: e.target.value as Task["priority"] }))}
                      className="input input-sm flex-1"
                    >
                      {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={newTask.due_date}
                      onChange={e => setNewTask(n => ({ ...n, due_date: e.target.value }))}
                      className="input input-sm flex-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={addTask} disabled={saving} className="btn btn-primary btn-sm flex-1">
                      {saving ? "…" : "Adicionar"}
                    </button>
                    <button onClick={() => setShowAdd(null)} className="btn btn-ghost btn-icon-sm">
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
                    className="relative overflow-hidden rounded-xl"
                  >
                    {/* Swipe delete background */}
                    <div
                      className="absolute inset-y-0 right-0 flex items-center justify-center w-20 rounded-r-xl"
                      style={{ background: "var(--error)" }}
                      aria-hidden="true"
                    >
                      <X className="w-5 h-5 text-white" />
                    </div>
                  <div
                    draggable
                    onDragStart={e => handleDragStart(e, task.id)}
                    onTouchStart={e => handleTouchStart(task.id, e)}
                    onTouchMove={e => handleTouchMove(task.id, e)}
                    onTouchEnd={() => handleTouchEnd(task.id)}
                    style={{
                      transform: `translateX(${swipeX[task.id] ?? 0}px)`,
                      transition: swipeX[task.id] ? "none" : "transform 0.2s ease",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-lg)",
                      opacity: draggedId === task.id ? 0.4 : 1,
                    }}
                    className="group relative p-3 cursor-grab active:cursor-grabbing transition-colors"
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-2)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--text-3)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug" style={{ color: "var(--text)" }}>{task.title}</p>
                        {task.description && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-3)" }}>{task.description}</p>}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-xs flex items-center gap-0.5" style={{ color: PRIORITY_COLORS[task.priority] }}>
                            <Flag className="w-3 h-3" />
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                          {task.due_date && (
                            <span className="text-xs flex items-center gap-0.5" style={{ color: "var(--text-3)" }}>
                              <Calendar className="w-3 h-3" />
                              {new Date(task.due_date).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="btn btn-ghost btn-icon-sm opacity-0 group-hover:opacity-100 shrink-0"
                        style={{ color: "var(--error)" }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
