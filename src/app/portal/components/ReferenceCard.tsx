"use client";

import { Trash2, Edit, ExternalLink, Tag } from "lucide-react";

export type Reference = {
  id: string;
  title: string;
  url?: string | null;
  platform?: string | null;
  notes?: string | null;
  tags?: string[] | null;
};

type ReferenceCardProps = {
  reference: Reference;
  onEdit?: (reference: Reference) => void;
  onDelete?: (id: string) => void;
  isLoading?: boolean;
};

const PLATFORM_ICONS: Record<string, string> = {
  figma: "🎨",
  miro: "📋",
  pinterest: "📌",
  notion: "📝",
  "google-drive": "☁️",
  dropbox: "📦",
  github: "🐙",
  jira: "🔗",
  slack: "💬",
  asana: "✅",
};

export function ReferenceCard({ reference, onEdit, onDelete, isLoading = false }: ReferenceCardProps) {
  const platformIcon = reference.platform ? PLATFORM_ICONS[reference.platform.toLowerCase()] || "🔗" : "🔗";

  return (
    <div
      className="rounded-lg border p-3 hover:shadow-sm transition"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{platformIcon}</span>
            <h4
              className="font-medium text-sm truncate"
              style={{ color: "var(--text)" }}
              title={reference.title}
            >
              {reference.title}
            </h4>
          </div>
          {reference.url && (
            <a
              href={reference.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs flex items-center gap-1 hover:underline truncate"
              style={{ color: "var(--text-2)" }}
              title={reference.url}
            >
              <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
              <span className="truncate">{reference.url}</span>
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onEdit && (
            <button
              onClick={() => onEdit(reference)}
              className="btn btn-secondary btn-sm"
              disabled={isLoading}
              aria-label="Edit reference"
            >
              <Edit className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(reference.id)}
              className="btn btn-secondary btn-sm"
              disabled={isLoading}
              aria-label="Delete reference"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {reference.notes && (
        <p
          className="text-xs mb-2 line-clamp-2"
          style={{ color: "var(--text-2)" }}
          title={reference.notes}
        >
          {reference.notes}
        </p>
      )}

      {reference.tags && reference.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {reference.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{
                backgroundColor: "var(--pastel-blue, rgba(219, 238, 255, 0.5))",
                color: "var(--text-2)",
              }}
            >
              <Tag className="h-2 w-2" />
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
