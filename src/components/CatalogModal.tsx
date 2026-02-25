"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Search, Plus, Check, Package } from "lucide-react";
import type { Categoria, ProjectItem } from "@/lib/types";
import { CATEGORIAS } from "@/lib/types";
import { generateId } from "@/lib/utils";

interface CatalogItem {
  id: string;
  categoria: Categoria;
  nome: string;
  unidade: string;
  preco_base: number;
  is_global: boolean;
}

interface CatalogModalProps {
  open: boolean;
  defaultCategoria?: Categoria;
  onClose: () => void;
  onSelect: (item: ProjectItem) => void;
}

export function CatalogModal({ open, defaultCategoria, onClose, onSelect }: CatalogModalProps) {
  const [activeTab, setActiveTab] = useState<Categoria>(defaultCategoria ?? "crew");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/catalog?categoria=${activeTab}`);
      if (res.ok) {
        const data = await res.json() as { items: CatalogItem[] };
        setItems(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (open) {
      fetchItems();
      setSelected(new Set());
      setSearch("");
    }
  }, [open, fetchItems]);

  useEffect(() => {
    if (open) {
      if (defaultCategoria) setActiveTab(defaultCategoria);
      fetchItems();
      setSelected(new Set());
      setSearch("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = items.filter((i) =>
    i.nome.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddSelected = () => {
    const toAdd = items.filter((i) => selected.has(i.id));
    toAdd.forEach((item) => {
      onSelect({
        id: generateId(),
        categoria: item.categoria,
        nome: item.nome,
        unidade: item.unidade,
        quantidade: 1,
        preco_unitario: item.preco_base,
        total: item.preco_base,
      });
    });
    onClose();
  };

  const handleAddBlank = () => {
    onSelect({
      id: generateId(),
      categoria: activeTab,
      nome: "",
      unidade: "dia",
      quantidade: 1,
      preco_unitario: 0,
      total: 0,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" style={{ color: "var(--accent)" }} />
            <h2 className="font-semibold" style={{ color: "var(--text)" }}>
              Catálogo de itens
            </h2>
          </div>
          <button className="btn btn-ghost btn-icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pb-3 overflow-x-auto">
          {CATEGORIAS.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setActiveTab(cat.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
              style={{
                background: activeTab === cat.value ? cat.color : "var(--surface-2)",
                color: activeTab === cat.value ? "#fff" : "var(--text-2)",
              }}
            >
              {cat.label.split(" ")[0]}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-3)" }} />
            <input
              className="input w-full pl-9 text-sm"
              placeholder="Pesquisar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-1.5">
          {loading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--surface-2)" }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--text-3)" }}>
              Nenhum item encontrado
            </p>
          ) : (
            filtered.map((item) => {
              const isSel = selected.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => toggleSelect(item.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                  style={{
                    background: isSel ? "var(--accent-subtle)" : "var(--surface-2)",
                    border: `1px solid ${isSel ? "var(--accent)" : "transparent"}`,
                  }}
                >
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center shrink-0"
                    style={{
                      background: isSel ? "var(--accent)" : "var(--surface)",
                      border: `1.5px solid ${isSel ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    {isSel && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                      {item.nome}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      {item.preco_base > 0
                        ? `${item.preco_base.toFixed(2)} € / ${item.unidade}`
                        : item.unidade}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 flex items-center gap-2 justify-between"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button className="btn btn-ghost btn-sm" onClick={handleAddBlank}>
            <Plus className="h-3.5 w-3.5" />
            Item em branco
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAddSelected}
            disabled={selected.size === 0}
          >
            Adicionar {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
