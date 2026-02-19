"use client";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { formatDateShort } from "@/lib/utils";
import { Plus, FileText } from "lucide-react";

interface TemplateRow {
  id: string;
  name: string;
  type: string;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  institutional: "Institucional",
  shortform: "Short-Form",
  documentary: "Documentário",
  event: "Evento",
  custom: "Personalizado",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const sb = createClient();
    const { data } = await sb.from("templates").select("id, name, type, created_at").order("created_at", { ascending: false });
    setTemplates((data ?? []) as TemplateRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Estruturas reutilizáveis de itens e checklists</p>
        </div>
        <button className="btn btn-primary" disabled>
          <Plus className="h-4 w-4" />
          Novo Template
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card space-y-3">
              <div className="skeleton h-10 w-10 rounded-lg" />
              <div className="skeleton h-5 w-32" />
              <div className="skeleton h-4 w-24" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <FileText className="empty-icon" />
            <p className="empty-title">Sem templates</p>
            <p className="empty-desc">Templates de itens e checklists por tipo de projeto (em breve)</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card card-hover"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg mb-3"
                style={{ background: "rgba(217,119,6,0.12)" }}
              >
                <FileText className="h-5 w-5" style={{ color: "#d97706" }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t.name}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                {TYPE_LABELS[t.type] ?? t.type} · {formatDateShort(t.created_at)}
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
