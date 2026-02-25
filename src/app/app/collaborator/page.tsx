"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, FolderOpen, Inbox, ListTodo, ShieldAlert } from "lucide-react";
import { MotionCard, MotionPage } from "@/components/motion-system";

type Project = {
  id: string;
  project_name: string;
};

type Task = {
  id: string;
  title: string;
  status: string;
};

export default function CollaboratorHomePage() {
  const searchParams = useSearchParams();
  const restricted = searchParams.get("restricted") === "1";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inboxCount, setInboxCount] = useState(0);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [projectsRes, tasksRes, inboxRes] = await Promise.all([
          fetch("/api/projects", { cache: "no-store" }),
          fetch("/api/tasks", { cache: "no-store" }),
          fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "list" }),
          }),
        ]);

        if (!projectsRes.ok || !tasksRes.ok || !inboxRes.ok) {
          throw new Error("Falha ao carregar dados de colaborador.");
        }

        const projectPayload = await projectsRes.json() as { projects?: Project[] };
        const tasksPayload = await tasksRes.json() as { tasks?: Task[] };
        const inboxPayload = await inboxRes.json() as { conversations?: Array<{ id: string }> };

        if (!active) return;
        setProjects(projectPayload.projects ?? []);
        setTasks(tasksPayload.tasks ?? []);
        setInboxCount((inboxPayload.conversations ?? []).length);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar dados.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <MotionPage className="space-y-4">
        <div className="skeleton-card h-28 rounded-[24px]" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="skeleton-card h-36 rounded-[24px]" />
          <div className="skeleton-card h-36 rounded-[24px]" />
          <div className="skeleton-card h-36 rounded-[24px]" />
        </div>
      </MotionPage>
    );
  }

  return (
    <MotionPage className="space-y-5">
      {restricted ? (
        <MotionCard className="alert alert-error">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span className="text-sm">Acesso restrito no modo colaborador.</span>
        </MotionCard>
      ) : null}

      <MotionCard className="card rounded-[24px] p-5">
        <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>
          Colaborador
        </p>
        <h1 className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>
          Workspace de execução
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
          Tens acesso apenas a projetos atribuídos, tarefas e inbox do projeto.
        </p>
      </MotionCard>

      {error ? (
        <MotionCard className="alert alert-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </MotionCard>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MotionCard className="card rounded-[20px] p-4">
          <FolderOpen className="h-5 w-5" style={{ color: "var(--accent-primary)" }} />
          <p className="mt-2 text-xl font-semibold">{projects.length}</p>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>Projetos atribuídos</p>
          <Link href="/app/projects" className="pill mt-3 inline-flex px-3 py-1.5 text-xs">Abrir projetos</Link>
        </MotionCard>

        <MotionCard className="card rounded-[20px] p-4">
          <ListTodo className="h-5 w-5" style={{ color: "var(--accent-primary)" }} />
          <p className="mt-2 text-xl font-semibold">{tasks.length}</p>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>Tarefas visíveis</p>
          <Link href="/app/tasks" className="pill mt-3 inline-flex px-3 py-1.5 text-xs">Abrir tarefas</Link>
        </MotionCard>

        <MotionCard className="card rounded-[20px] p-4">
          <Inbox className="h-5 w-5" style={{ color: "var(--accent-primary)" }} />
          <p className="mt-2 text-xl font-semibold">{inboxCount}</p>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>Conversas ativas</p>
          <Link href="/app/inbox" className="pill mt-3 inline-flex px-3 py-1.5 text-xs">Abrir inbox</Link>
        </MotionCard>
      </div>
    </MotionPage>
  );
}
