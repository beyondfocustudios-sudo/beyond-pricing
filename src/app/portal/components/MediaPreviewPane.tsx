"use client";

import { Play } from "lucide-react";

type MediaPreviewPaneProps = {
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  onFullscreen?: () => void;
  isLoading?: boolean;
};

export function MediaPreviewPane({
  fileUrl,
  fileName,
  fileType,
  onFullscreen,
  isLoading = false,
}: MediaPreviewPaneProps) {
  const isVideo =
    fileType?.startsWith("video/") ||
    (fileType?.includes("video") ?? false);
  const isImage =
    fileType?.startsWith("image/") ||
    (fileType?.includes("image") ?? false);

  return (
    <div className="relative w-full h-full bg-black dark:bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center group">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2" />
            <p className="text-xs text-white">Carregando...</p>
          </div>
        </div>
      )}

      {fileUrl ? (
        <>
          {isVideo ? (
            <video
              src={fileUrl}
              className="w-full h-full object-contain"
              controls
              controlsList="nodownload"
            />
          ) : isImage ? (
            <img
              src={fileUrl}
              alt={fileName || "Preview"}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-center text-white">
              <p className="text-sm mb-2">Tipo de ficheiro não suportado</p>
              <p className="text-xs text-gray-400">{fileType || "Desconhecido"}</p>
            </div>
          )}

          {isVideo && (
            <button
              onClick={onFullscreen}
              className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition opacity-0 group-hover:opacity-100"
              aria-label="Fullscreen"
            >
              <Play className="h-12 w-12 text-white fill-white" />
            </button>
          )}
        </>
      ) : (
        <div className="text-center">
          <Play className="h-16 w-16 text-slate-400 mx-auto mb-3 opacity-50" />
          <p className="text-sm text-slate-400">Seleciona um ficheiro</p>
        </div>
      )}
    </div>
  );
}
