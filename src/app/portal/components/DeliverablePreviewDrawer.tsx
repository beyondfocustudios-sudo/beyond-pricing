"use client";

import { useEffect, useState } from "react";
import { X, Download, Loader2, AlertCircle, FileText, Image as ImageIcon, Video } from "lucide-react";

interface Deliverable {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  created_at: string;
  dropbox_url?: string | null;
}

interface DeliverablePreviewDrawerProps {
  deliverable: Deliverable | null;
  onClose: () => void;
}

export function DeliverablePreviewDrawer({ deliverable, onClose }: DeliverablePreviewDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deliverable) return;

    const loadPreview = async () => {
      setLoading(true);
      setError(null);
      setPreviewUrl(null);

      try {
        // Try to get the actual preview link from the API
        const res = await fetch(`/api/review/deliverables/${deliverable.id}`);
        if (!res.ok) {
          // Fallback to dropbox_url if available
          if (deliverable.dropbox_url) {
            setPreviewUrl(deliverable.dropbox_url);
            // Infer mime type from URL or file extension
            if (deliverable.dropbox_url.includes('.pdf') || deliverable.dropbox_url.includes('pdf')) {
              setMimeType('application/pdf');
            } else if (deliverable.dropbox_url.includes('.mp4') || deliverable.dropbox_url.includes('video')) {
              setMimeType('video/mp4');
            }
          }
          return;
        }

        const data = await res.json();
        if (data.latestFile) {
          // Use preview_url with dl=0 for Dropbox preview
          const url = data.latestFile.preview_url || data.latestFile.shared_link;
          if (url) {
            setPreviewUrl(url.includes('dl=0') ? url : url.replace('dl=1', 'dl=0'));
            setMimeType(data.latestFile.mime_type || 'application/octet-stream');
          }
        } else if (deliverable.dropbox_url) {
          setPreviewUrl(deliverable.dropbox_url);
        } else {
          setError('Ficheiro não disponível para preview');
        }
      } catch (err) {
        console.error('Error loading preview:', err);
        if (deliverable.dropbox_url) {
          setPreviewUrl(deliverable.dropbox_url);
        } else {
          setError('Erro ao carregar ficheiro');
        }
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [deliverable]);

  if (!deliverable) return null;

  const isVideo = mimeType?.startsWith('video');
  const isPdf = mimeType === 'application/pdf';
  const Icon = isVideo ? Video : isPdf ? FileText : FileText;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0, 0, 0, 0.5)" }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full w-full max-w-2xl z-50 flex flex-col overflow-hidden rounded-l-2xl"
        style={{ background: "var(--bg)" }}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b p-4" style={{ borderColor: "var(--border-soft)" }}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate" style={{ color: "var(--text)" }}>
                {deliverable.title}
              </h2>
              <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>
                {new Date(deliverable.created_at).toLocaleDateString("pt-PT", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 flex-shrink-0 p-2 rounded-xl transition-colors"
              style={{ background: "var(--surface-3)", color: "var(--text-3)" }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {deliverable.description && (
            <div className="mb-6">
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                {deliverable.description}
              </p>
            </div>
          )}

          {/* Preview Area */}
          <div className="rounded-2xl border p-4" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--text-3)" }} />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <AlertCircle className="w-8 h-8" style={{ color: "var(--error)" }} />
                <p className="text-sm text-center" style={{ color: "var(--text-2)" }}>
                  {error}
                </p>
              </div>
            ) : isVideo && previewUrl ? (
              <video
                src={previewUrl}
                controls
                className="w-full rounded-xl max-h-96"
                style={{ background: "var(--surface-3)" }}
              />
            ) : isPdf && previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full rounded-xl"
                style={{ height: "500px", border: "none", background: "var(--surface-3)" }}
              />
            ) : previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center py-12 gap-3 hover:opacity-80 transition-opacity"
              >
                <Icon className="w-12 h-12" style={{ color: "var(--accent-primary)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--accent-primary)" }}>
                  Abrir ficheiro
                </p>
              </a>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <FileText className="w-8 h-8" style={{ color: "var(--text-3)" }} />
                <p className="text-sm" style={{ color: "var(--text-2)" }}>
                  Sem preview disponível
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {previewUrl && (
          <div className="flex-shrink-0 border-t p-4 flex gap-2" style={{ borderColor: "var(--border-soft)" }}>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium transition-colors"
              style={{ background: "var(--accent-primary)", color: "#fff" }}
            >
              <Download className="w-4 h-4" />
              Descarregar
            </a>
          </div>
        )}
      </div>
    </>
  );
}
