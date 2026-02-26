"use client";

import { MessageSquare, CheckCircle2, Clock } from "lucide-react";
import { ReviewThread } from "@/app/portal/context/ReviewContext";

type ThreadPanelProps = {
  threads: ReviewThread[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onResolveThread: (threadId: string, resolved: boolean) => Promise<void>;
  onJumpToTimecode: (seconds: number) => void;
  isLoading?: boolean;
};

export function ThreadPanel({
  threads,
  selectedThreadId,
  onSelectThread,
  onResolveThread,
  onJumpToTimecode,
  isLoading = false,
}: ThreadPanelProps) {
  const selectedThread = threads.find((t) => t.id === selectedThreadId);
  const openThreads = threads.filter((t) => t.status === "open");
  const resolvedThreads = threads.filter((t) => t.status === "resolved");

  const formatTime = (seconds?: number | null) => {
    if (!Number.isFinite(seconds)) return "--:--";
    const total = Math.max(0, Math.floor(Number(seconds)));
    const min = Math.floor(total / 60).toString().padStart(2, "0");
    const sec = (total % 60).toString().padStart(2, "0");
    return `${min}:${sec}`;
  };

  return (
    <div className="flex flex-col h-full dark:bg-slate-900">
      {/* Thread List */}
      <div className="flex-1 overflow-y-auto border-b dark:border-slate-700">
        {threads.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare className="h-8 w-8 mx-auto text-slate-400 mb-2" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sem comentários ainda
            </p>
          </div>
        ) : (
          <>
            {openThreads.length > 0 && (
              <div className="p-3 border-b dark:border-slate-700">
                <h4 className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-2">
                  Abertos ({openThreads.length})
                </h4>
                <div className="space-y-2">
                  {openThreads.map((thread) => (
                    <ThreadItem
                      key={thread.id}
                      thread={thread}
                      isSelected={selectedThreadId === thread.id}
                      onSelect={onSelectThread}
                      onJumpToTimecode={onJumpToTimecode}
                      formatTime={formatTime}
                    />
                  ))}
                </div>
              </div>
            )}

            {resolvedThreads.length > 0 && (
              <div className="p-3">
                <h4 className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-2">
                  Resolvidos ({resolvedThreads.length})
                </h4>
                <div className="space-y-2 opacity-75">
                  {resolvedThreads.map((thread) => (
                    <ThreadItem
                      key={thread.id}
                      thread={thread}
                      isSelected={selectedThreadId === thread.id}
                      onSelect={onSelectThread}
                      onJumpToTimecode={onJumpToTimecode}
                      formatTime={formatTime}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Selected Thread Details */}
      {selectedThread && (
        <div className="p-4 border-t dark:border-slate-700 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {selectedThread.timecode_seconds !== null &&
                selectedThread.timecode_seconds !== undefined ? (
                  <button
                    onClick={() =>
                      onJumpToTimecode(selectedThread.timecode_seconds || 0)
                    }
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    ⏱ {formatTime(selectedThread.timecode_seconds)}
                  </button>
                ) : (
                  "Geral"
                )}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 line-clamp-3">
                {selectedThread.review_comments[0]?.body ||
                  "Sem comentários"}
              </p>
            </div>
            <button
              onClick={() =>
                void onResolveThread(
                  selectedThread.id,
                  selectedThread.status === "open"
                )
              }
              disabled={isLoading}
              className={`text-xs font-medium px-2 py-1 rounded transition ${
                selectedThread.status === "open"
                  ? "text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              {selectedThread.status === "open" ? "✓ Resolver" : "✓ Resolvido"}
            </button>
          </div>

          {selectedThread.review_comments.length > 1 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              +{selectedThread.review_comments.length - 1}{" "}
              {selectedThread.review_comments.length === 2
                ? "resposta"
                : "respostas"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadItem({
  thread,
  isSelected,
  onSelect,
  onJumpToTimecode,
  formatTime,
}: {
  thread: ReviewThread;
  isSelected: boolean;
  onSelect: (threadId: string) => void;
  onJumpToTimecode: (seconds: number) => void;
  formatTime: (seconds?: number | null) => string;
}) {
  const firstComment = thread.review_comments[0];

  return (
    <button
      onClick={() => onSelect(thread.id)}
      className={`w-full text-left p-2 rounded-lg transition border ${
        isSelected
          ? "border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900"
          : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      <div className="flex items-start gap-2">
        {thread.status === "resolved" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
            {firstComment?.body || "Comentário"}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {thread.timecode_seconds !== null &&
            thread.timecode_seconds !== undefined ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onJumpToTimecode(thread.timecode_seconds || 0);
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <Clock className="h-2.5 w-2.5" />
                {formatTime(thread.timecode_seconds)}
              </button>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Geral
              </span>
            )}
            {thread.review_comments.length > 1 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                +{thread.review_comments.length - 1}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
