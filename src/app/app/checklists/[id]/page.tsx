"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { CHECKLIST_FASES, type ChecklistFase } from "@/lib/types";
import { generateId } from "@/lib/utils";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  CheckSquare,
  Square,
  Folder,
  Edit2,
} from "lucide-react";
import { useToast } from "@/components/Toast";

interface ChecklistItem {
  id: string;
  checklist_id: string;
  fase: ChecklistFase;
  texto: string;
  concluido: boolean;
  ordem: number;
  created_at: string;
  _local?: boolean; // not yet persisted
}

interface ChecklistData {
  id: string;
  nome: string;
  project_id: string | null;
  projects?: { project_name: string } | null;
}

export default function ChecklistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [checklist, setChecklist] = useState<ChecklistData | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFase, setActiveFase] = useState<ChecklistFase>("pre_producao");
  const [editingName, setEditingName] = useState(false);
  const [checklistName, setChecklistName] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const [saving, setSaving] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const newItemRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const sb = createClient();
      const [{ data: cl, error: clError }, { data: its, error: itemsError }] = await Promise.all([
        sb
          .from("checklists")
          .select("id, nome, project_id, projects(project_name)")
          .eq("id", id)
          .single(),
        sb
          .from("checklist_items")
          .select("*")
          .eq("checklist_id", id)
          .order("ordem", { ascending: true }),
      ]);

      if (clError || !cl) {
        setLoadError(clError?.message ?? "Checklist não encontrada ou sem acesso.");
        return;
      }
      if (itemsError) {
        setLoadError(itemsError.message);
        return;
      }

      setChecklist(cl as unknown as ChecklistData);
      setChecklistName(cl.nome);
      setItems((its ?? []) as ChecklistItem[]);
    } catch {
      setLoadError("Sem ligação — não foi possível carregar a checklist.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (editingName && nameRef.current) nameRef.current.focus();
  }, [editingName]);

  // ── Save name ─────────────────────────────────────────────
  const saveName = async () => {
    setEditingName(false);
    if (!checklistName.trim() || checklistName === checklist?.nome) return;
    const sb = createClient();
    const { error } = await sb.from("checklists").update({ nome: checklistName }).eq("id", id);
    if (error) {
      toast.error(`Erro ao guardar nome: ${error.message}`);
      setChecklistName(checklist?.nome ?? "");
    } else {
      setChecklist((prev) => prev ? { ...prev, nome: checklistName } : prev);
    }
  };

  // ── Toggle item ──────────────────────────────────────────
  const toggleItem = async (item: ChecklistItem) => {
    const newVal = !item.concluido;
    setItems((prev) =>
      prev.map((it) => it.id === item.id ? { ...it, concluido: newVal } : it)
    );
    if (!item._local) {
      const sb = createClient();
      await sb
        .from("checklist_items")
        .update({ concluido: newVal })
        .eq("id", item.id);
    }
  };

  // ── Add item ─────────────────────────────────────────────
  const addItem = async () => {
    const text = newItemText.trim();
    if (!text) return;

    const faseItems = items.filter((i) => i.fase === activeFase);
    const newItem: ChecklistItem = {
      id: generateId(),
      checklist_id: id,
      fase: activeFase,
      texto: text,
      concluido: false,
      ordem: faseItems.length,
      created_at: new Date().toISOString(),
      _local: true,
    };

    setItems((prev) => [...prev, newItem]);
    setNewItemText("");
    newItemRef.current?.focus();

    const sb = createClient();
    const { data, error } = await sb
      .from("checklist_items")
      .insert({
        checklist_id: id,
        fase: activeFase,
        texto: text,
        concluido: false,
        ordem: faseItems.length,
      })
      .select()
      .single();

    if (error) {
      // Rollback optimistic update
      setItems((prev) => prev.filter((it) => it.id !== newItem.id));
      toast.error(`Erro ao adicionar item: ${error.message}`);
    } else if (data) {
      setItems((prev) =>
        prev.map((it) => it.id === newItem.id ? { ...(data as ChecklistItem), _local: false } : it)
      );
    }
  };

  // ── Delete item ──────────────────────────────────────────
  const deleteItem = async (itemId: string, isLocal: boolean) => {
    const prev = items;
    setItems((p) => p.filter((it) => it.id !== itemId)); // optimistic
    if (!isLocal) {
      const sb = createClient();
      const { error } = await sb.from("checklist_items").delete().eq("id", itemId);
      if (error) {
        setItems(prev); // rollback
        toast.error(`Erro ao apagar item: ${error.message}`);
      }
    }
  };

  // ── Batch-complete all in fase ───────────────────────────
  const completeAll = async (fase: ChecklistFase) => {
    setSaving(true);
    const faseItems = items.filter((i) => i.fase === fase && !i.concluido);
    if (faseItems.length === 0) { setSaving(false); return; }

    setItems((prev) =>
      prev.map((it) => it.fase === fase ? { ...it, concluido: true } : it)
    );

    const sb = createClient();
    const ids = faseItems.filter((i) => !i._local).map((i) => i.id);
    if (ids.length > 0) {
      await sb.from("checklist_items").update({ concluido: true }).in("id", ids);
    }
    setSaving(false);
  };

  // ── Derived stats ────────────────────────────────────────
  const faseItems = (fase: ChecklistFase) => items.filter((i) => i.fase === fase);
  const faseProgress = (fase: ChecklistFase) => {
    const its = faseItems(fase);
    if (its.length === 0) return 0;
    return Math.round((its.filter((i) => i.concluido).length / its.length) * 100);
  };
  const totalProgress = items.length === 0
    ? 0
    : Math.round((items.filter((i) => i.concluido).length / items.length) * 100);

  // ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="skeleton h-8 w-8 rounded-lg" />
            <div className="skeleton h-6 w-48" />
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card">
              <div className="skeleton h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="card text-center space-y-3">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Erro ao carregar checklist</p>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>{loadError}</p>
          <div className="flex items-center justify-center gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => void load()}>Tentar novamente</button>
            <Link href="/app/checklists" className="btn btn-ghost btn-sm">Voltar</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/app/checklists"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
            style={{ background: "var(--surface-2)" }}
          >
            <ArrowLeft className="h-4 w-4" style={{ color: "var(--text-2)" }} />
          </Link>
          {editingName ? (
            <input
              ref={nameRef}
              value={checklistName}
              onChange={(e) => setChecklistName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setChecklistName(checklist?.nome ?? ""); setEditingName(false); } }}
              className="input text-lg font-semibold min-w-0 flex-1"
              style={{ padding: "0.25rem 0.5rem", color: "var(--text)" }}
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="flex items-center gap-2 group min-w-0"
            >
              <h1
                className="page-title truncate"
                style={{ margin: 0 }}
              >
                {checklistName}
              </h1>
              <Edit2
                className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
                style={{ color: "var(--text-3)" }}
              />
            </button>
          )}
        </div>
        {checklist?.projects && (
          <Link
            href={`/app/projects/${checklist.project_id}`}
            className="badge badge-accent shrink-0 flex items-center gap-1"
            style={{ fontSize: "0.7rem" }}
          >
            <Folder className="h-3 w-3" />
            {(checklist.projects as { project_name?: string })?.project_name}
          </Link>
        )}
      </div>

      {/* Overall progress */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
            Progresso geral
          </p>
          <span
            className="text-xl font-bold"
            style={{ color: totalProgress === 100 ? "#34d399" : "var(--accent-2)" }}
          >
            {totalProgress}%
          </span>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: "6px", background: "var(--surface-3)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: totalProgress === 100 ? "#34d399" : "var(--accent)" }}
            initial={{ width: 0 }}
            animate={{ width: `${totalProgress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
        <div className="flex gap-4 mt-3">
          {CHECKLIST_FASES.map((f) => {
            const pct = faseProgress(f.value);
            return (
              <div key={f.value} className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full" style={{ background: f.color }} />
                <span className="text-xs" style={{ color: "var(--text-3)" }}>
                  {f.label}: <span style={{ color: "var(--text-2)" }}>{pct}%</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fase tabs */}
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{ background: "var(--surface-2)" }}
      >
        {CHECKLIST_FASES.map((f) => {
          const count = faseItems(f.value).length;
          const done = faseItems(f.value).filter((i) => i.concluido).length;
          const isActive = activeFase === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setActiveFase(f.value)}
              className="flex-1 flex flex-col items-center gap-0.5 rounded-lg py-2 px-1 text-xs font-medium transition-all"
              style={{
                background: isActive ? "var(--surface)" : "transparent",
                color: isActive ? f.color : "var(--text-3)",
                boxShadow: isActive ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
              }}
            >
              <span className="font-semibold hidden sm:block">{f.label}</span>
              <span className="sm:hidden">{f.label.split(" ")[0]}</span>
              <span
                className="text-xs opacity-80"
                style={{ color: isActive ? f.color : "var(--text-3)" }}
              >
                {done}/{count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Items list */}
      <div className="space-y-1.5">
        <AnimatePresence mode="popLayout">
          {faseItems(activeFase).map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="card flex items-center gap-3 group"
              style={{ padding: "0.75rem 1rem" }}
            >
              <button
                onClick={() => toggleItem(item)}
                className="shrink-0 transition-transform active:scale-95"
                aria-label={item.concluido ? "Marcar incompleto" : "Marcar concluído"}
              >
                {item.concluido ? (
                  <CheckSquare
                    className="h-5 w-5"
                    style={{ color: "#34d399" }}
                  />
                ) : (
                  <Square
                    className="h-5 w-5"
                    style={{ color: "var(--text-3)" }}
                  />
                )}
              </button>
              <span
                className="flex-1 text-sm"
                style={{
                  color: item.concluido ? "var(--text-3)" : "var(--text)",
                  textDecoration: item.concluido ? "line-through" : "none",
                }}
              >
                {item.texto}
              </span>
              <button
                onClick={() => deleteItem(item.id, item._local ?? false)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                style={{ color: "var(--text-3)" }}
                aria-label="Eliminar item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {faseItems(activeFase).length === 0 && (
          <div className="card">
            <div className="empty-state" style={{ padding: "2rem 1rem" }}>
              <CheckSquare className="empty-icon" />
              <p className="empty-title">Sem itens</p>
              <p className="empty-desc">Adiciona itens para a fase de {CHECKLIST_FASES.find(f => f.value === activeFase)?.label}</p>
            </div>
          </div>
        )}
      </div>

      {/* Add item input */}
      <div
        className="card flex items-center gap-3"
        style={{ padding: "0.75rem 1rem" }}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "var(--surface-2)" }}
        >
          <Plus className="h-4 w-4" style={{ color: "var(--text-3)" }} />
        </div>
        <input
          ref={newItemRef}
          type="text"
          placeholder={`Novo item em ${CHECKLIST_FASES.find(f => f.value === activeFase)?.label}…`}
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-3)]"
          style={{ color: "var(--text)", border: "none" }}
        />
        {newItemText && (
          <button
            onClick={addItem}
            className="btn btn-primary btn-sm shrink-0"
          >
            <Check className="h-3.5 w-3.5" />
            Adicionar
          </button>
        )}
      </div>

      {/* Complete all button */}
      {faseItems(activeFase).some((i) => !i.concluido) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            onClick={() => completeAll(activeFase)}
            disabled={saving}
            className="btn btn-secondary w-full"
          >
            <Check className="h-4 w-4" />
            Concluir todos os itens desta fase
          </button>
        </motion.div>
      )}
    </div>
  );
}
