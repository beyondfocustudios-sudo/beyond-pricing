"use client";

import { Check, Send, AlertCircle } from "lucide-react";
import { useState } from "react";

export interface ApprovalChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

type ApprovalsPanelProps = {
  deliverableTitle: string;
  checklist: ApprovalChecklistItem[];
  onChecklistChange: (items: ApprovalChecklistItem[]) => void;
  signature: string;
  onSignatureChange: (sig: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  onApprove: (decision: "approved" | "changes_requested") => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
};

export function ApprovalsPanel({
  deliverableTitle: _deliverableTitle,
  checklist,
  onChecklistChange,
  signature,
  onSignatureChange,
  notes,
  onNotesChange,
  onApprove,
  isSubmitting,
  error,
}: ApprovalsPanelProps) {
  const [decision, setDecision] = useState<"approved" | "changes_requested">("approved");
  const allChecked = checklist.every((item) => item.checked);

  const handleCheckItem = (itemId: string) => {
    const updated = checklist.map((item) =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    onChecklistChange(updated);
  };

  const handleSubmit = async () => {
    if (!signature.trim()) {
      return;
    }
    await onApprove(decision);
  };

  return (
    <div className="sticky bottom-0 z-20 border-t bg-white dark:bg-slate-900 dark:border-slate-700 border-slate-200 shadow-lg">
      {/* Checklist */}
      <div className="border-b dark:border-slate-700 p-4 dark:bg-slate-900">
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>
          Checklist de Qualidade
        </h3>
        <div className="space-y-2">
          {checklist.map((item) => (
            <label key={item.id} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => handleCheckItem(item.id)}
                className="w-4 h-4 rounded"
                aria-label={item.label}
              />
              <span className="text-sm" style={{ color: "var(--text-2)" }}>
                {item.label}
              </span>
              {item.checked && <Check className="w-4 h-4 text-green-600" />}
            </label>
          ))}
        </div>
        {allChecked && (
          <p className="text-xs mt-2 text-green-600 dark:text-green-400">
            ✓ Todos os items verificados
          </p>
        )}
      </div>

      {/* Signature and Decision */}
      <div className="p-4 space-y-4 dark:bg-slate-900">
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: "var(--text)" }}>
            Assinatura *
          </label>
          <input
            type="text"
            value={signature}
            onChange={(e) => onSignatureChange(e.target.value)}
            placeholder="Digite seu nome ou assinatura"
            className="w-full px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 dark:text-white"
            style={{ borderColor: "var(--border)" }}
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: "var(--text)" }}>
            Notas (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Adicione notas ou feedback..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 dark:text-white resize-none"
            style={{ borderColor: "var(--border)" }}
            disabled={isSubmitting}
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value as "approved" | "changes_requested")}
            className="px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 dark:text-white text-sm"
            style={{ borderColor: "var(--border)" }}
            disabled={isSubmitting}
          >
            <option value="approved">✓ Aprovado</option>
            <option value="changes_requested">⚠ Pedir Alterações</option>
          </select>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !signature.trim()}
            className="btn btn-primary btn-sm flex items-center gap-2 flex-1"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? "A enviar..." : "Submeter"}
          </button>
        </div>
      </div>
    </div>
  );
}
