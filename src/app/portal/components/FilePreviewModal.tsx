"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Download, X, ZoomIn, ZoomOut } from "lucide-react";
import * as pdfjs from "pdfjs-dist";

// Set up PDF.js worker
if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

type FilePreviewModalProps = {
  isOpen: boolean;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  expiresAt?: string | null;
  onClose: () => void;
  onDownload: () => void;
};

export function FilePreviewModal({
  isOpen,
  fileUrl,
  fileName,
  fileType,
  expiresAt,
  onClose,
  onDownload,
}: FilePreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPages, setPdfPages] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Calculate if link is expiring soon
  const expirationWarning =
    expiresAt && new Date(expiresAt).getTime() - Date.now() < 30 * 60 * 1000;

  // Determine file type
  const isVideo = fileType?.startsWith("video/");
  const isImage = fileType?.startsWith("image/");
  const isPdf = fileType === "application/pdf";
  const canPreview = isVideo || isImage || isPdf;

  // Load PDF
  const loadPdf = async () => {
    if (!fileUrl || !canvasRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const pdf = await pdfjs.getDocument(fileUrl).promise;
      setPdfPages(pdf.numPages);
      renderPdfPage(pdf, 1);
    } catch (err) {
      setError("Failed to load PDF. " + (err instanceof Error ? err.message : ""));
    } finally {
      setLoading(false);
    }
  };

  const renderPdfPage = async (pdf: pdfjs.PDFDocumentProxy, pageNum: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const context = canvas.getContext("2d");
      if (!context) return;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      setPdfPage(pageNum);
    } catch (err) {
      setError("Failed to render PDF page. " + (err instanceof Error ? err.message : ""));
    }
  };

  const handlePdfPageChange = async (newPage: number) => {
    if (newPage < 1 || newPage > pdfPages) return;
    setLoading(true);
    try {
      const pdf = await pdfjs.getDocument(fileUrl!).promise;
      await renderPdfPage(pdf, newPage);
    } finally {
      setLoading(false);
    }
  };

  // Load PDF on mount
  useEffect(() => {
    if (isOpen && isPdf) {
      loadPdf();
    }
  }, [isOpen, isPdf, fileUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {/* Modal backdrop */}
      <div className="absolute inset-0 z-40" onClick={onClose} />

      {/* Modal content */}
      <div className="relative z-50 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border bg-white shadow-2xl dark:bg-slate-900 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4 dark:border-slate-700">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold truncate text-slate-900 dark:text-white">
              {fileName || "File Preview"}
            </h2>
            {expirationWarning && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Link expires soon (&lt; 30 min)
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-800">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
                <p className="text-sm text-slate-600 dark:text-slate-400">Preparing preview...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full p-4">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && isVideo && fileUrl && (
            <div className="w-full h-full flex items-center justify-center bg-black">
              <video
                ref={videoRef}
                src={fileUrl}
                controls
                className="max-w-full max-h-full"
                controlsList="nodownload"
              />
            </div>
          )}

          {!loading && !error && isImage && fileUrl && (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <div className="flex items-center justify-center flex-1 overflow-auto">
                <img
                  ref={imageRef}
                  src={fileUrl}
                  alt={fileName || "Image"}
                  className="max-w-full max-h-full object-contain"
                  style={{ transform: `scale(${imageZoom})` }}
                />
              </div>
              <div className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-700 p-3 dark:bg-slate-900 bg-white w-full justify-center">
                <button
                  onClick={() => setImageZoom((z) => Math.max(0.5, z - 0.25))}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition"
                  disabled={imageZoom <= 0.5}
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {Math.round(imageZoom * 100)}%
                </span>
                <button
                  onClick={() => setImageZoom((z) => Math.min(3, z + 0.25))}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition"
                  disabled={imageZoom >= 3}
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {!loading && !error && isPdf && (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <div className="flex-1 overflow-auto flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  className="max-w-full max-h-full object-contain border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              {pdfPages > 0 && (
                <div className="flex items-center gap-3 border-t border-slate-200 dark:border-slate-700 p-3 dark:bg-slate-900 bg-white w-full justify-center">
                  <button
                    onClick={() => handlePdfPageChange(pdfPage - 1)}
                    disabled={pdfPage <= 1}
                    className="px-3 py-1 text-sm font-medium rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition"
                  >
                    ← Previous
                  </button>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Page {pdfPage} of {pdfPages}
                  </span>
                  <button
                    onClick={() => handlePdfPageChange(pdfPage + 1)}
                    disabled={pdfPage >= pdfPages}
                    className="px-3 py-1 text-sm font-medium rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}

          {!loading && !error && !canPreview && fileUrl && (
            <div className="flex items-center justify-center h-full p-4">
              <div className="text-center">
                <FilePreviewIcon className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                  Preview not available
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
                  This file format cannot be previewed in the browser
                </p>
                <button
                  onClick={onDownload}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                >
                  <Download className="h-4 w-4" />
                  Download File
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {canPreview && fileUrl && (
          <div className="flex items-center justify-end gap-3 border-t p-4 dark:border-slate-700">
            <button
              onClick={onDownload}
              className="inline-flex items-center gap-2 px-4 py-2 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition text-sm font-medium"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition text-sm font-medium"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple file icon component
function FilePreviewIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.66V6.75a2.25 2.25 0 002.25 2.25h2.25a2.25 2.25 0 002.25-2.25V6.708m-5.801 0A2.251 2.251 0 0113.5 6c0-.546.226-1.036.605-1.392m-6.605 1.392c-.37-.356-.605-.846-.605-1.392m0 0A2.252 2.252 0 1013.5 6c0 .546-.226 1.036-.605 1.392m-6.605-1.392A2.25 2.25 0 1013.5 6m0 0h3.75a2.25 2.25 0 012.25 2.25v2.25a2.25 2.25 0 01-2.25 2.25m-4.5 0H6a2.25 2.25 0 01-2.25-2.25V9m11.35 5.175l.75.75a2.5 2.5 0 01-3.536 0m3.536 0a2.5 2.5 0 00-3.536-3.536m0 0L3.75 3.75"
      />
    </svg>
  );
}
