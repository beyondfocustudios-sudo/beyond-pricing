"use client";

import { createContext, ReactNode, useContext, useState, useCallback } from "react";

type InboxDrawerContextType = {
  isOpen: boolean;
  projectId: string | null;
  openDrawer: (projectId: string) => void;
  closeDrawer: () => void;
  toggleDrawer: (projectId: string) => void;
};

const InboxDrawerContext = createContext<InboxDrawerContextType | undefined>(undefined);

export function InboxDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  const openDrawer = useCallback((id: string) => {
    setProjectId(id);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => setProjectId(null), 300); // Clear projectId after animation
  }, []);

  const toggleDrawer = useCallback(
    (id: string) => {
      if (isOpen && projectId === id) {
        closeDrawer();
      } else {
        openDrawer(id);
      }
    },
    [isOpen, projectId, openDrawer, closeDrawer]
  );

  return (
    <InboxDrawerContext.Provider value={{ isOpen, projectId, openDrawer, closeDrawer, toggleDrawer }}>
      {children}
    </InboxDrawerContext.Provider>
  );
}

export function useInboxDrawer() {
  const context = useContext(InboxDrawerContext);
  if (!context) {
    throw new Error("useInboxDrawer must be used within InboxDrawerProvider");
  }
  return context;
}
