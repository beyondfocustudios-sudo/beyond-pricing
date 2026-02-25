"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  Mail,
  Package,
  Shield,
  Video,
} from "lucide-react";
import {
  getClientProjects,
  getConversations,
  getProjectDeliverables,
  getProjectMilestones,
  type PortalConversation,
  type PortalDeliverable,
  type PortalMilestone,
  type PortalProject,
} from "@/lib/portal-data";
import { transitions, variants } from "@/lib/motion";

function matchQuery(text: string, query: string) {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

function statusLabel(status: string | null) {
  const value = (status ?? "").toLowerCase();
  if (!value) return "Em progresso";
  const map: Record<string, string> = {
    draft: "Rascunho",
    sent: "Em revisão",
    in_review: "Em revisão",
    approved: "Aprovado",
    cancelled: "Cancelado",
    archived: "Arquivado",
  };
  return map[value] ?? status ?? "Em progresso";
}

export default function PortalDashboardPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [deliveries, setDeliveries] = useState<PortalDeliverable[]>([]);
  const [milestones, setMilestones] = useState<PortalMilestone[]>([]);
  const [conversations, setConversations] = useState<PortalConversation[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const loadedProjects = await getClientProjects();
        const projectIds = loadedProjects.map((project) => project.id);

        const [convos, deliveriesByProject, milestonesByProject] = await Promise.all([
          getConversations(),
          Promise.all(projectIds.slice(0, 8).map((projectId) => getProjectDeliverables(projectId))),
          Promise.all(projectIds.slice(0, 8).map((projectId) => getProjectMilestones(projectId))),
        ]);

        if (cancelled) return;

        setProjects(loadedProjects);
        setConversations(convos);
        setDeliveries(deliveriesByProject.flat().slice(0, 16));
        setMilestones(milestonesByProject.flat().slice(0, 16));
      } catch {
        if (!cancelled) setError("Não foi possível carregar o dashboard do portal.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProjects = useMemo(() => {
    if (!query) return projects;
    return projects.filter((project) => matchQuery(project.name, query));
  }, [projects, query]);

  const activeProjects = filteredProjects.filter((project) => {
    const status = (project.status ?? "").toLowerCase();
    return status !== "archived" && status !== "cancelled";
  }).length;

  const deliveriesLast7Days = deliveries.filter((delivery) => {
    const createdAt = new Date(delivery.created_at).getTime();
    return Date.now() - createdAt <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  const pendingApprovals = filteredProjects.filter((project) => {
    const status = (project.status ?? "").toLowerCase();
    return status === "sent" || status === "in_review";
  }).length;

  const unreadMessages = conversations.reduce((acc, convo) => acc + Number(convo.unread_count ?? 0), 0);

  const nextMilestone = milestones.find((milestone) => milestone.due_date && (milestone.status ?? "") !== "completed") ?? null;

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="skeleton h-28 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
          <div className="skeleton h-[360px] rounded-3xl" />
        </div>
        <div className="space-y-4">
          <div className="skeleton h-40 rounded-3xl" />
          <div className="skeleton h-40 rounded-3xl" />
          <div className="skeleton h-40 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6">
        <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
        <button className="btn btn-secondary mt-3" onClick={() => window.location.reload()}>Tentar novamente</button>
      </div>
    );
  }

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={variants.containerStagger}
      transition={transitions.smooth}
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <section className="space-y-4 min-w-0">
        <motion.article variants={variants.cardEnter} className="card p-6">
          <p className="text-xs uppercase tracking-[0.12em]" style={{ color: "var(--text-3)" }}>Portal Cliente</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]" style={{ color: "var(--text)" }}>Olá, bem-vindo</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            Próximo passo: {nextMilestone ? `${nextMilestone.title}` : "Rever entregas mais recentes."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/portal/projects" className="btn btn-primary btn-sm">
              Abrir projetos
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/portal/inbox" className="btn btn-secondary btn-sm">Ver inbox</Link>
          </div>
        </motion.article>

        <motion.div variants={variants.containerStagger} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Projetos ativos", value: String(activeProjects), icon: Video },
            { label: "Entregas (7 dias)", value: String(deliveriesLast7Days), icon: Package },
            { label: "Aprovações pendentes", value: String(pendingApprovals), icon: CircleAlert },
            { label: "Mensagens", value: String(unreadMessages), icon: Mail },
          ].map((item) => (
            <motion.article key={item.label} variants={variants.cardEnter} className="card p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>{item.label}</p>
                <item.icon className="h-4 w-4" style={{ color: "var(--accent-blue)" }} />
              </div>
              <p className="mt-3 text-2xl font-semibold" style={{ color: "var(--text)" }}>{item.value}</p>
            </motion.article>
          ))}
        </motion.div>

        <motion.article variants={variants.cardEnter} className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>Projetos</h3>
            <Link href="/portal/projects" className="btn btn-ghost btn-sm">Ver todos</Link>
          </div>
          <div className="space-y-2">
            {filteredProjects.slice(0, 5).map((project) => (
              <Link key={project.id} href={`/portal/projects/${project.id}`} className="card card-hover block p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{project.name}</p>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      Atualizado {new Date(project.updated_at).toLocaleDateString("pt-PT")}
                    </p>
                  </div>
                  <span className="pill text-[11px]">{statusLabel(project.status)}</span>
                </div>
              </Link>
            ))}
            {filteredProjects.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                Sem projetos para o filtro atual.
              </div>
            ) : null}
          </div>
        </motion.article>
      </section>

      <aside className="space-y-4 min-w-0">
        <motion.article variants={variants.cardEnter} className="card p-5">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Atividade</h3>
          <div className="mt-3 space-y-2">
            {deliveries.slice(0, 3).map((delivery) => (
              <Link key={delivery.id} href={`/portal/projects/${delivery.project_id}?tab=deliveries`} className="flex items-start gap-2 rounded-xl p-2" style={{ background: "var(--surface-2)" }}>
                <Package className="mt-0.5 h-3.5 w-3.5" style={{ color: "var(--accent-blue)" }} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium" style={{ color: "var(--text)" }}>{delivery.title}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{new Date(delivery.created_at).toLocaleString("pt-PT")}</p>
                </div>
              </Link>
            ))}
          </div>
        </motion.article>

        <motion.article variants={variants.cardEnter} className="card p-5">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Marcar call</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
            Agenda uma call rápida para alinhar alterações.
          </p>
          <a className="btn btn-primary btn-sm mt-3 w-full" href="/portal/calendar">
            <CalendarClock className="h-4 w-4" />
            Abrir agenda
          </a>
        </motion.article>

        <motion.article variants={variants.cardEnter} className="card p-5">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Segurança</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
            Mantém a tua conta atualizada.
          </p>
          <Link className="btn btn-secondary btn-sm mt-3 w-full" href="/portal/login">
            <Shield className="h-4 w-4" />
            Atualizar password
          </Link>
        </motion.article>
      </aside>
    </motion.div>
  );
}
