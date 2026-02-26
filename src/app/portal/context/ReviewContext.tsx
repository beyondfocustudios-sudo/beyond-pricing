"use client";

import { createContext, ReactNode, useContext, useState } from "react";

export type ReviewThread = {
  id: string;
  version_id: string;
  timecode_seconds?: number | null;
  x?: number | null;
  y?: number | null;
  status: "open" | "resolved";
  created_at: string;
  review_comments: Array<{
    id: string;
    thread_id: string;
    body: string;
    created_by: string | null;
    guest_name?: string | null;
    guest_email?: string | null;
    created_at: string;
  }>;
};

export type ReviewApproval = {
  id: string;
  decision: "approved" | "changes_requested" | "rejected";
  approved_at?: string | null;
  created_at: string;
  note?: string | null;
  comment?: string | null;
};

type ReviewContextType = {
  threads: ReviewThread[];
  setThreads: (threads: ReviewThread[]) => void;
  selectedThreadId: string | null;
  setSelectedThreadId: (threadId: string | null) => void;
  approvals: ReviewApproval[];
  setApprovals: (approvals: ReviewApproval[]) => void;
  loadingThreads: boolean;
  setLoadingThreads: (loading: boolean) => void;
  threadError: string | null;
  setThreadError: (error: string | null) => void;
};

const ReviewContext = createContext<ReviewContextType | undefined>(undefined);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ReviewThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ReviewApproval[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  return (
    <ReviewContext.Provider
      value={{
        threads,
        setThreads,
        selectedThreadId,
        setSelectedThreadId,
        approvals,
        setApprovals,
        loadingThreads,
        setLoadingThreads,
        threadError,
        setThreadError,
      }}
    >
      {children}
    </ReviewContext.Provider>
  );
}

export function useReview() {
  const context = useContext(ReviewContext);
  if (!context) {
    throw new Error("useReview must be used within a ReviewProvider");
  }
  return context;
}
