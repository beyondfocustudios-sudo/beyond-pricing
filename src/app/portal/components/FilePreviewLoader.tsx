"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

type FilePreviewLoaderProps = {
  deliverableId: string;
  versionId?: string | null;
  onReady: (data: {
    fileType: string | null;
    fileName: string | null;
    expiresAt: string | null;
  }) => void;
  onError: (error: string) => void;
};

export function FilePreviewLoader({
  deliverableId,
  versionId,
  onReady,
  onError,
}: FilePreviewLoaderProps) {
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);

  const fetchDeliverableInfo = async (retryCount: number = 0) => {
    setLoading(true);
    setAttemptCount(retryCount);

    try {
      const query = versionId ? `?versionId=${versionId}` : "";
      const response = await fetch(`/api/review/deliverables/${deliverableId}${query}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.latestFile) {
        throw new Error("No file found for this deliverable");
      }

      onReady({
        fileType: data.latestFile.file_type || data.latestFile.mime_type || null,
        fileName: data.latestFile.filename || null,
        expiresAt: null, // Will be set when link is generated
      });

      setLoading(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load deliverable info";

      // Exponential backoff retry logic
      if (retryCount < 2) {
        const backoffMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        setRetrying(true);
        setTimeout(() => {
          setRetrying(false);
          fetchDeliverableInfo(retryCount + 1);
        }, backoffMs);
      } else {
        onError(errorMessage);
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchDeliverableInfo();
  }, [deliverableId, versionId]);

  if (!loading && !retrying) {
    return null; // Hide when ready or error
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative z-50 rounded-2xl border bg-white dark:bg-slate-900 dark:border-slate-700 p-8 max-w-sm w-full shadow-2xl">
        {retrying ? (
          <>
            <div className="flex items-center justify-center mb-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-center mb-2">
              Preparing preview...
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Attempt {attemptCount + 1} of 3
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-3">
              Retrying in {Math.pow(2, attemptCount)}s
            </p>
          </>
        ) : loading ? (
          <>
            <div className="flex items-center justify-center mb-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-center mb-2">
              Preparing preview...
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Loading file information
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
