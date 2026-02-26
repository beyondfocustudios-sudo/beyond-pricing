"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGroup } from "framer-motion";
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
import {
  HeroSummaryCard,
  CompactKpiCard,
  ListCard,
  DarkCalendarCard,
  type ListRow,
  type ScheduleItem,
} from "@/components/dashboard/super-dashboard";
import { MotionList, MotionListItem, MotionPage } from "@/components/motion-system";
import { formatDateShort } from "@/lib/utils";

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

function buildGoogleLink(title: string, startIso: string, subtitle: string) {
  const start = new Date(startIso).toISOString().replace(/[-:]/g, "").replace(".000", "");
  const end = new Date(new Date(startIso).getTime() + 45 * 60 * 1000).toISOString().replace(/[-:]/g, "").replace(".000", "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    details: subtitle,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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

  // Schedule items for calendar (moved before conditional returns)
  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    const upcomingMilestones = milestones
      .filter((m) => m.due_date && new Date(m.due_date).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
      .sort((a, b) => new Date(a.due_date ?? "").getTime() - new Date(b.due_date ?? "").getTime())
      .slice(0, 4);

    if (upcomingMilestones.length > 0) {
      return upcomingMilestones.map((milestone, idx) => {
        const start = new Date(milestone.due_date ?? "");
        return {
          id: milestone.id,
          time: start.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
          title: milestone.title,
          subtitle: `Marco · ${formatDateShort(milestone.due_date ?? "")}`,
          startsAt: milestone.due_date ?? "",
          calendarHref: buildGoogleLink(milestone.title, milestone.due_date ?? "", `Marco · ${formatDateShort(milestone.due_date ?? "")}`),
          googleHref: buildGoogleLink(milestone.title, milestone.due_date ?? "", `Marco · ${formatDateShort(milestone.due_date ?? "")}`),
          active: idx === 0,
        };
      });
    }

    const upcomingDeliveries = deliveries
      .filter((d) => new Date(d.created_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
      .slice(0, 4);

    if (upcomingDeliveries.length > 0) {
      return upcomingDeliveries.map((delivery, idx) => {
        const start = new Date(delivery.created_at);
        return {
          id: delivery.id,
          time: start.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
          title: delivery.title || "Entrega",
          subtitle: `Entrega · ${formatDateShort(delivery.created_at)}`,
          startsAt: delivery.created_at,
          calendarHref: buildGoogleLink(delivery.title || "Entrega", delivery.created_at, `Entrega · ${formatDateShort(delivery.created_at)}`),
          googleHref: buildGoogleLink(delivery.title || "Entrega", delivery.created_at, `Entrega · ${formatDateShort(delivery.created_at)}`),
          active: idx === 0,
        };
      });
    }

    const baseDate = new Date();
    const placeholders = [
      { id: "ph-1", time: "10:00", title: "Próxima entrega", subtitle: "Revisa os marcos" },
      { id: "ph-2", time: "14:30", title: "Reunião de alinhamento", subtitle: "Com o teu gestor de projeto" },
      { id: "ph-3", time: "16:00", title: "Aprovações pendentes", subtitle: "Feedback das entregas" },
      { id: "ph-4", time: "09:00", title: "Planear próximas tarefas", subtitle: "Visão geral dos projetos" },
    ];

    return placeholders.map((item, idx) => {
      const [h, m] = item.time.split(":").map(Number);
      const start = new Date(baseDate);
      start.setHours(h, m, 0, 0);
      return {
        ...item,
        startsAt: start.toISOString(),
        calendarHref: buildGoogleLink(item.title, start.toISOString(), item.subtitle),
        googleHref: buildGoogleLink(item.title, start.toISOString(), item.subtitle),
        active: idx === 0,
      };
    });
  }, [milestones, deliveries]);

  const projectListRows = useMemo<ListRow[]>(() => {
    return filteredProjects.slice(0, 5).map((project) => ({
      id: project.id,
      title: project.name,
      subtitle: new Date(project.updated_at).toLocaleDateString("pt-PT"),
      status: statusLabel(project.status),
      ctaHref: `/portal/projects/${project.id}`,
      ctaLabel: "Abrir",
    }));
  }, [filteredProjects]);

  const activityRows = useMemo<ListRow[]>(() => {
    return deliveries.slice(0, 5).map((delivery) => ({
      id: delivery.id,
      title: delivery.title || "Entrega",
      subtitle: formatDateShort(delivery.created_at),
      status: statusLabel(delivery.status),
      ctaHref: `/portal/projects/${delivery.project_id}?tab=deliveries`,
      ctaLabel: "Ver",
    }));
  }, [deliveries]);

  if (loading) {
    return (
      <MotionPage className="space-y-6 pb-28 md:pb-8">
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-12">
          <div className="skeleton h-40 rounded-3xl xl:col-span-12" />
          <div className="grid gap-4 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
          <div className="skeleton h-80 rounded-3xl xl:col-span-5" />
          <div className="skeleton h-80 rounded-3xl xl:col-span-3" />
        </div>
      </MotionPage>
    );
  }

  if (error) {
    return (
      <MotionPage>
        <div className="super-card p-6">
          <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
          <button className="btn btn-secondary mt-3" onClick={() => window.location.reload()}>Tentar novamente</button>
        </div>
      </MotionPage>
    );
  }

  return (
    <MotionPage className="space-y-6 pb-28 md:pb-8">
      <LayoutGroup id="portal-dashboard-layout">
        <MotionList className="grid gap-6 lg:grid-cols-2 xl:grid-cols-12">
          {/* Hero Card */}
          <MotionListItem className="xl:col-span-12">
            <HeroSummaryCard
              greeting="Olá, bem-vindo"
              subtitle="Acompanha os teus projetos, entregas e aprovações."
              metrics={[
                { id: "projects", label: "Projetos ativos", value: String(activeProjects), hint: "Em progresso", tone: "blue" },
                { id: "deliveries", label: "Entregas (7d)", value: String(deliveriesLast7Days), hint: "Semana atual", tone: "yellow" },
                { id: "approvals", label: "Aprovações", value: String(pendingApprovals), hint: "Pendentes", tone: "lilac" },
                { id: "messages", label: "Mensagens", value: String(unreadMessages), hint: "Não lidas", tone: "mint" },
              ]}
              primaryCta={{ href: "/portal/projects", label: "Abrir projetos" }}
            />
          </MotionListItem>

          {/* Left Column: Projects & Quick Actions */}
          <MotionListItem className="grid content-start gap-6 lg:col-span-1 xl:col-span-4">
            <section className="super-card">
              <p className="text-[0.68rem] uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>Quick Links</p>
              <h3 className="mt-1 text-lg font-semibold" style={{ color: "var(--text)" }}>Acções rápidas</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>Atalhos para navegar o portal.</p>
              <div className="mt-4 grid gap-2">
                <Link href="/portal/projects" className="pill-tab">Abrir projetos</Link>
                <Link href="/portal/inbox" className="pill-tab">Ver inbox</Link>
                <Link href="/portal/calendar" className="pill-tab">Agendar call</Link>
              </div>
            </section>
            <ListCard title="Projetos" subtitle="Os teus projetos ativos" rows={projectListRows} href="/portal/projects" />
          </MotionListItem>

          {/* Center Column: KPIs */}
          <MotionListItem className="grid content-start gap-6 lg:col-span-1 xl:col-span-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <CompactKpiCard label="Projetos ativos" value={String(activeProjects)} hint="Em progresso" />
              <CompactKpiCard label="Entregas semana" value={String(deliveriesLast7Days)} hint="7 últimos dias" />
              <CompactKpiCard label="Aprovações" value={String(pendingApprovals)} hint="Aguardando" />
              <CompactKpiCard label="Mensagens" value={String(unreadMessages)} hint="Não lidas" />
            </div>
            <ListCard title="Atividade recente" subtitle="Entregas e marcos" rows={activityRows} href="/portal/deliveries" />
          </MotionListItem>

          {/* Right Column: Calendar */}
          <MotionListItem className="grid content-start gap-6 lg:col-span-2 xl:col-span-3">
            <DarkCalendarCard
              events={scheduleItems}
              feedHref="#"
              href="/portal/calendar"
              onCreateEvent={() => {}}
            />
            <section className="super-card">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Segurança da conta</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>Mantém a tua conta segura.</p>
              <Link className="btn btn-secondary btn-sm mt-3 w-full" href="/portal/login">
                Atualizar password
              </Link>
            </section>
          </MotionListItem>
        </MotionList>
      </LayoutGroup>
    </MotionPage>
  );
}
