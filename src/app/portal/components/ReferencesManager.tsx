"use client";

import { useState } from "react";
import { Plus, Loader2, AlertCircle } from "lucide-react";
import { ReferenceCard, Reference } from "./ReferenceCard";

export type ReferencesManagerProps = {
  projectId: string;
  references: Reference[];
  onCreateReference?: (data: Omit<Reference, "id">) => Promise<void>;
  onUpdateReference?: (id: string, data: Partial<Reference>) => Promise<void>;
  onDeleteReference?: (id: string) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
};

const PLATFORM_OPTIONS = [
  { value: "", label: "Nenhuma plataforma" },
  { value: "figma", label: "Figma" },
  { value: "miro", label: "Miro" },
  { value: "pinterest", label: "Pinterest" },
  { value: "notion", label: "Notion" },
  { value: "google-drive", label: "Google Drive" },
  { value: "dropbox", label: "Dropbox" },
  { value: "github", label: "GitHub" },
  { value: "jira", label: "Jira" },
  { value: "slack", label: "Slack" },
  { value: "asana", label: "Asana" },
];

export function ReferencesManager({
  projectId,
  references,
  onCreateReference,
  onUpdateReference,
  onDeleteReference,
  isLoading = false,
  error,
}: ReferencesManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<Reference, "id">>({
    title: "",
    url: "",
    platform: "",
    notes: "",
    tags: [],
  });
  const [tagInput, setTagInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({ title: "", url: "", platform: "", notes: "", tags: [] });
    setTagInput("");
    setFormError(null);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (ref: Reference) => {
    setEditingId(ref.id);
    setFormData({
      title: ref.title,
      url: ref.url || "",
      platform: ref.platform || "",
      notes: ref.notes || "",
      tags: ref.tags || [],
    });
    setShowForm(true);
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (!tag || (formData.tags || []).length >= 5) return;
    if ((formData.tags || []).includes(tag)) return;

    setFormData((prev) => ({
      ...prev,
      tags: [...(prev.tags || []), tag],
    }));
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((t) => t !== tag),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.title.trim()) {
      setFormError("Título é obrigatório");
      return;
    }

    if (formData.url && !isValidUrl(formData.url)) {
      setFormError("URL inválida");
      return;
    }

    setSubmitting(true);
    try {
      if (editingId && onUpdateReference) {
        await onUpdateReference(editingId, formData);
      } else if (onCreateReference) {
        await onCreateReference(formData);
      }
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar referência");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem a certeza que deseja eliminar esta referência?")) return;
    if (!onDeleteReference) return;

    setSubmitting(true);
    try {
      await onDeleteReference(id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao eliminar referência");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border" style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.3)" }}>
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary btn-sm w-full"
          disabled={isLoading}
        >
          <Plus className="h-4 w-4" />
          Nova Referência
        </button>
      ) : null}

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            {editingId ? "Editar Referência" : "Nova Referência"}
          </h3>

          {formError && (
            <div className="flex items-start gap-2 p-2 rounded text-xs" style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "rgb(220, 38, 38)" }}>
              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text)" }}>
              Título *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Nome ou descrição"
              className="input w-full text-sm"
              maxLength={150}
              disabled={submitting}
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-3)" }}>
              {formData.title.length}/150
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text)" }}>
              URL
            </label>
            <input
              type="url"
              value={formData.url || ""}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com"
              className="input w-full text-sm"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text)" }}>
              Plataforma
            </label>
            <select
              value={formData.platform || ""}
              onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
              className="input w-full text-sm"
              disabled={submitting}
            >
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text)" }}>
              Tags (máx. 5)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Adicionar tag..."
                className="input flex-1 text-sm"
                maxLength={20}
                disabled={submitting || (formData.tags?.length ?? 0) >= 5}
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="btn btn-secondary btn-sm"
                disabled={!tagInput.trim() || (formData.tags?.length ?? 0) >= 5 || submitting}
              >
                Adicionar
              </button>
            </div>
            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: "var(--pastel-blue, rgba(219, 238, 255, 0.5))",
                      color: "var(--text-2)",
                    }}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:opacity-75"
                      disabled={submitting}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text)" }}>
              Notas
            </label>
            <textarea
              value={formData.notes || ""}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Adicionar notas ou contexto..."
              className="input w-full text-sm resize-none"
              rows={2}
              maxLength={1000}
              disabled={submitting}
            />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-3)" }}>
              {(formData.notes?.length ?? 0)}/1000
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary btn-sm flex-1"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? "Atualizar" : "Criar"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={submitting}
              className="btn btn-secondary btn-sm flex-1"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {references.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {references.map((ref) => (
            <ReferenceCard
              key={ref.id}
              reference={ref}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isLoading={submitting}
            />
          ))}
        </div>
      ) : !showForm ? (
        <div className="rounded-lg border p-6 text-center" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
          <p className="text-sm">Sem referências ainda</p>
          <p className="text-xs mt-1">Adicione links, documentos e referências do projeto</p>
        </div>
      ) : null}
    </div>
  );
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return url.startsWith("/");
  }
}
