"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  CalendarDays,
  ChevronLeft,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  Package,
  Send,
  Star,
} from "lucide-react";

type TabId = "overview" | "deliveries" | "approvals" | "documents" | "references" | "inbox" | "calendar";

type PortalProject = {
  id: string;
  project_name: string;
  client_name?: string | null;
  status?: string | null;
  updated_at?: string;
  created_at?: string;
  shoot_days?: string[] | null;
  inputs?: Record<string, unknown> | null;
};

type Milestone = {
  id: string;
  project_id: string;
  title: string;
  phase?: string | null;
  status?: string | null;
  progress_percent?: number | null;
  due_date?: string | null;
  description?: string | null;
};

type Deliverable = {
  id: string;
  project_id: string;
  title: string;
  status?: string | null;
  description?: string | null;
  created_at: string;
  updated_at?: string;
  dropbox_url?: string | null;
};

type DeliverableFile = {
  id: string;
  project_id: string;
  deliverable_id?: string | null;
  filename: string;
  file_type?: string | null;
  mime?: string | null;
  ext?: string | null;
  bytes?: number | null;
  shared_link?: string | null;
  preview_url?: string | null;
  created_at: string;
};

type Approval = {
  id: string;
  deliverable_id: string;
  decision?: string | null;
  note?: string | null;
  comment?: string | null;
  approved_at?: string | null;
  created_at: string;
};

type ClientRequest = {
  id: string;
  title: string;
  description?: string | null;
  type?: string;
  priority?: string;
  status?: string;
  deadline?: string | null;
  created_at: string;
};

type InboxMessage = {
  id: string;
  sender_type: "client" | "team";
  body: string;
  created_at: string;
};

type CalendarEntry = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  description?: string | null;
  source: "milestone" | "shoot_day";
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "deliveries", label: "Entregas" },
  { id: "approvals", label: "Aprovações" },
  { id: "documents", label: "Documentos" },
  { id: "references", label: "Referências" },
  { id: "inbox", label: "Inbox" },
  { id: "calendar", label: "Calendário" },
];

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Pré-produção",
  enviado: "Em aprovação",
  aprovado: "Aprovado",
  cancelado: "Cancelado",
  arquivado: "Arquivado",
  draft: "Pré-produção",
  sent: "Enviado",
  in_review: "Em revisão",
  approved: "Aprovado",
  cancelled: "Cancelado",
  archived: "Arquivado",
};

function formatDate(iso?: string | null, withTime = false) {
  if (!iso) return "sem data";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "sem data";
  return date.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function extractLinks(text: string | null | undefined) {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  return Array.from(new Set(matches.map((item) => item.trim())));
}

function toGoogleCalendarUrl(entry: CalendarEntry) {
  const start = new Date(entry.startsAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const end = new Date(entry.endsAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: entry.title,
    dates: `${start}/${end}`,
  });
  if (entry.description) params.set("details", entry.description);
  if (entry.location) params.set("location", entry.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildQuickIcsUrl(entry: CalendarEntry) {
  const params = new URLSearchParams({
    title: entry.title,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
  });
  if (entry.description) params.set("description", entry.description);
  if (entry.location) params.set("location", entry.location);
  return `/api/calendar/quick-event.ics?${params.toString()}`;
}

function tabClass(active: boolean) {
  return `pill ${active ? "pill-active" : ""}`;
}

export default function PortalProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const impersonationToken = searchParams.get("impersonate");

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [project, setProject] = useState<PortalProject | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [files, setFiles] = useState<DeliverableFile[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [references, setReferences] = useState<string[]>([]);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const readOnlyMode = Boolean(impersonationToken);

  const loadImpersonation = useCallback(async () => {
    if (!impersonationToken) return;

    const response = await fetch(`/api/portal/impersonation/project?token=${encodeURIComponent(impersonationToken)}&projectId=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      project?: PortalProject;
      milestones?: Milestone[];
      deliverables?: Deliverable[];
      files?: DeliverableFile[];
      approvals?: Approval[];
      requests?: ClientRequest[];
      references?: string[];
      conversationId?: string | null;
      messages?: InboxMessage[];
    };

    if (!response.ok || !payload.project) {
      throw new Error(payload.error ?? "Não foi possível abrir o projeto em modo visualização.");
    }

    setProject(payload.project);
    setMilestones(payload.milestones ?? []);
    setDeliverables(payload.deliverables ?? []);
    setFiles(payload.files ?? []);
    setApprovals(payload.approvals ?? []);
    setRequests(payload.requests ?? []);
    setReferences(payload.references ?? []);
    setConversationId(payload.conversationId ?? null);
    setMessages(payload.messages ?? []);
  }, [id, impersonationToken]);

  const loadNormal = useCallback(async () => {
    const supabase = createClient();

    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select("id, project_name, client_name, status, updated_at, created_at, shoot_days, inputs")
      .eq("id", id)
      .single();

    if (projectError || !projectRow) {
      throw new Error(projectError?.message ?? "Projeto não encontrado.");
    }

    setProject(projectRow as PortalProject);

    const [milestonesRes, deliverablesRes, filesRes, requestsRes, briefRes, conversationRes] = await Promise.all([
      supabase
        .from("project_milestones")
        .select("id, project_id, title, phase, status, progress_percent, due_date, description")
        .eq("project_id", id)
        .is("deleted_at", null)
        .order("due_date", { ascending: true }),
      supabase
        .from("deliverables")
        .select("id, project_id, title, status, description, created_at, updated_at, dropbox_url")
        .eq("project_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("deliverable_files")
        .select("id, project_id, deliverable_id, filename, file_type, mime, ext, bytes, shared_link, preview_url, created_at")
        .eq("project_id", id)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .order("created_at", { ascending: false }),
      supabase
        .from("client_requests")
        .select("id, title, description, type, priority, status, deadline, created_at")
        .eq("project_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("briefs")
        .select("referencias, observacoes")
        .eq("project_id", id)
        .maybeSingle(),
      fetch(`/api/conversations?projectId=${id}`, { cache: "no-store" }),
    ]);

    setMilestones((milestonesRes.data ?? []) as Milestone[]);
    setDeliverables((deliverablesRes.data ?? []) as Deliverable[]);
    setFiles((filesRes.data ?? []) as DeliverableFile[]);

    const deliverableIds = (deliverablesRes.data ?? []).map((row) => String(row.id));
    if (deliverableIds.length > 0) {
      const { data: approvalsRows } = await supabase
        .from("approvals")
        .select("id, deliverable_id, decision, note, comment, approved_at, created_at")
        .in("deliverable_id", deliverableIds)
        .order("created_at", { ascending: false });
      setApprovals((approvalsRows ?? []) as Approval[]);
    } else {
      setApprovals([]);
    }

    setRequests((requestsRes.data ?? []) as ClientRequest[]);

    const projectInputs = (projectRow.inputs as Record<string, unknown> | null) ?? null;
    const linkSet = new Set<string>([
      ...extractLinks(briefRes.data?.referencias ?? null),
      ...extractLinks(briefRes.data?.observacoes ?? null),
      ...extractLinks(typeof projectInputs?.descricao === "string" ? projectInputs.descricao : null),
      ...extractLinks(typeof projectInputs?.observacoes === "string" ? projectInputs.observacoes : null),
    ]);
    setReferences(Array.from(linkSet));

    if (conversationRes.ok) {
      const convPayload = (await conversationRes.json().catch(() => ({}))) as { conversation?: { id?: string } };
      const convId = String(convPayload.conversation?.id ?? "").trim();
      setConversationId(convId || null);
      if (convId) {
        const messagesRes = await fetch(`/api/messages?conversationId=${convId}&limit=50`, { cache: "no-store" });
        if (messagesRes.ok) {
          const msgPayload = (await messagesRes.json().catch(() => ({}))) as { messages?: InboxMessage[] };
          const messageRows = msgPayload.messages ?? [];
          setMessages(messageRows);
          if (messageRows.length > 0) {
            await fetch("/api/messages/read", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messageIds: messageRows.map((row) => row.id) }),
            });
          }
        } else {
          setMessages([]);
        }
      } else {
        setMessages([]);
      }
    }
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (impersonationToken) {
        await loadImpersonation();
      } else {
        await loadNormal();
      }
    } catch (loadErr) {
      setError(loadErr instanceof Error ? loadErr.message : "Falha ao carregar projeto.");
    } finally {
      setLoading(false);
    }
  }, [impersonationToken, loadImpersonation, loadNormal]);

  useEffect(() => {
    void load();
  }, [load]);

  const documentFiles = useMemo(() => {
    return files.filter((file) => {
      const ext = String(file.ext ?? "").toLowerCase();
      const mime = String(file.mime ?? "").toLowerCase();
      const type = String(file.file_type ?? "").toLowerCase();
      return type === "document" || mime.includes("pdf") || mime.includes("document") || ["pdf", "doc", "docx", "ppt", "pptx"].includes(ext);
    });
  }, [files]);

  const calendarEntries = useMemo(() => {
    const fromMilestones: CalendarEntry[] = milestones
      .filter((milestone) => Boolean(milestone.due_date))
      .map((milestone) => {
        const start = new Date(`${String(milestone.due_date)}T09:00:00.000Z`).toISOString();
        const end = new Date(`${String(milestone.due_date)}T10:00:00.000Z`).toISOString();
        return {
          id: `m-${milestone.id}`,
          title: milestone.title,
          startsAt: start,
          endsAt: end,
          description: milestone.description ?? `Fase: ${milestone.phase ?? "projeto"}`,
          source: "milestone",
        };
      });

    const shootDays = (project?.shoot_days ?? []).map((day, index) => {
      const start = new Date(`${day}T08:00:00.000Z`).toISOString();
      const end = new Date(`${day}T18:00:00.000Z`).toISOString();
      return {
        id: `s-${index}-${day}`,
        title: `Shoot Day ${index + 1}`,
        startsAt: start,
        endsAt: end,
        description: "Dia de rodagem",
        source: "shoot_day" as const,
      };
    });

    return [...fromMilestones, ...shootDays].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [milestones, project?.shoot_days]);

  const goToPortalHome = useCallback(() => {
    router.push(`/portal${impersonationToken ? `?impersonate=${encodeURIComponent(impersonationToken)}` : ""}`);
  }, [impersonationToken, router]);

  const openReview = (deliverableId: string) => {
    router.push(`/portal/review/${deliverableId}${impersonationToken ? `?impersonate=${encodeURIComponent(impersonationToken)}` : ""}`);
  };

  const sendMessage = useCallback(async () => {
    if (readOnlyMode) return;
    const body = messageInput.trim();
    if (!body || sendingMessage) return;

    setSendingMessage(true);
    try {
      let convId = conversationId;
      if (!convId) {
        const convResponse = await fetch(`/api/conversations?projectId=${id}`, { cache: "no-store" });
        const convPayload = (await convResponse.json().catch(() => ({}))) as { conversation?: { id?: string } };
        convId = String(convPayload.conversation?.id ?? "").trim() || null;
        setConversationId(convId);
      }

      if (!convId) {
        throw new Error("Não foi possível abrir a conversa do projeto.");
      }

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, body }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: InboxMessage };
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao enviar mensagem.");
      }

      setMessageInput("");
      if (payload.message) {
        setMessages((prev) => [...prev, payload.message as InboxMessage]);
      } else {
        await load();
      }
    } catch (sendErr) {
      setError(sendErr instanceof Error ? sendErr.message : "Falha ao enviar mensagem.");
    } finally {
      setSendingMessage(false);
    }
  }, [conversationId, id, load, messageInput, readOnlyMode, sendingMessage]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: "var(--text-3)" }} />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="card p-6 text-center space-y-3">
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Erro ao abrir projeto</p>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>{error ?? "Projeto não encontrado."}</p>
        <div className="flex items-center justify-center gap-2">
          <button className="btn btn-secondary btn-sm" onClick={load}>Tentar novamente</button>
          <button className="btn btn-ghost btn-sm" onClick={goToPortalHome}>Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <button className="btn btn-ghost btn-sm" onClick={goToPortalHome}>
            <ChevronLeft className="h-4 w-4" />
            Portal
          </button>
          {readOnlyMode ? (
            <span className="badge badge-warning">View as client</span>
          ) : null}
        </div>

        <h1 className="mt-3 text-xl font-semibold" style={{ color: "var(--text)" }}>{project.project_name}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
          Estado: {STATUS_LABELS[String(project.status ?? "")] ?? (project.status || "Em progresso")}
          {project.updated_at ? ` · atualizado ${formatDate(project.updated_at, true)}` : ""}
        </p>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button key={tab.id} className={tabClass(activeTab === tab.id)} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "overview" && (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="card p-4 lg:col-span-2">
            <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Timeline simples</p>
            <div className="mt-3 space-y-2">
              {milestones.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem marcos definidos.</p>
              ) : milestones.map((milestone) => (
                <div key={milestone.id} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{milestone.title}</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>
                    {milestone.phase ?? "fase"} · {formatDate(milestone.due_date)} · {milestone.status ?? "pendente"}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <article className="card p-4">
            <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Próximas ações</p>
            <div className="mt-3 space-y-2">
              <button className="btn btn-secondary btn-sm w-full justify-start" onClick={() => setActiveTab("deliveries")}>Abrir entregas</button>
              <button className="btn btn-secondary btn-sm w-full justify-start" onClick={() => setActiveTab("approvals")}>Abrir aprovações</button>
              <button className="btn btn-secondary btn-sm w-full justify-start" onClick={() => setActiveTab("inbox")}>Abrir inbox</button>
            </div>
          </article>
        </section>
      )}

      {activeTab === "deliveries" && (
        <section className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Entregas</p>
            <Package className="h-4 w-4" style={{ color: "var(--text-3)" }} />
          </div>

          <div className="mt-3 space-y-2">
            {deliverables.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem entregas publicadas.</p>
            ) : deliverables.map((item) => (
              <div key={item.id} className="rounded-xl border px-3 py-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{item.title}</p>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      {item.status ?? "review"} · {formatDate(item.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.dropbox_url ? (
                      <a href={item.dropbox_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        <Download className="h-4 w-4" /> Download
                      </a>
                    ) : null}
                    <button className="btn btn-primary btn-sm" onClick={() => openReview(item.id)}>
                      Abrir review
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "approvals" && (
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Feedback e pedidos</p>
              <Star className="h-4 w-4" style={{ color: "var(--text-3)" }} />
            </div>
            <div className="mt-3 space-y-2">
              {requests.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem pedidos de feedback registados.</p>
              ) : requests.map((request) => (
                <div key={request.id} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{request.title}</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>
                    {request.status ?? "aberto"} · prioridade {request.priority ?? "média"} · {formatDate(request.created_at)}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <article className="card p-4">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Histórico de aprovações</p>
            <div className="mt-3 space-y-2">
              {approvals.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Ainda não existem decisões de aprovação.</p>
              ) : approvals.map((approval) => (
                <div key={approval.id} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{approval.decision ?? "decision"}</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>{formatDate(approval.approved_at ?? approval.created_at, true)}</p>
                  {approval.note || approval.comment ? (
                    <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>{approval.note ?? approval.comment}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
                Entregas para feedback
              </p>
              {deliverables.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem entregas para abrir review.</p>
              ) : deliverables.slice(0, 5).map((deliverable) => (
                <div key={deliverable.id} className="rounded-xl border px-3 py-2 flex items-center justify-between gap-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{deliverable.title}</p>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>{deliverable.status ?? "in_review"}</p>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => openReview(deliverable.id)}>
                    Abrir review
                  </button>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {activeTab === "documents" && (
        <section className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Documentos</p>
            <FileText className="h-4 w-4" style={{ color: "var(--text-3)" }} />
          </div>
          <div className="mt-3 space-y-2">
            {documentFiles.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem documentos ligados ao projeto.</p>
            ) : documentFiles.map((file) => (
              <div key={file.id} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{file.filename}</p>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>{formatDate(file.created_at)}</p>
                  </div>
                  {file.shared_link ? (
                    <a href={file.shared_link} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "references" && (
        <section className="card p-4">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Moodboard e referências</p>
          <div className="mt-3 space-y-2">
            {references.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem referências partilhadas.</p>
            ) : references.map((reference) => (
              <a
                key={reference}
                href={reference}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text)" }}
              >
                <span className="truncate text-sm">{reference}</span>
                <ExternalLink className="h-4 w-4 shrink-0" style={{ color: "var(--text-3)" }} />
              </a>
            ))}
          </div>
        </section>
      )}

      {activeTab === "inbox" && (
        <section className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Inbox</p>
            <MessageSquare className="h-4 w-4" style={{ color: "var(--text-3)" }} />
          </div>

          <div className="mt-3 space-y-2 max-h-[46vh] overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem mensagens ainda.</p>
            ) : messages.map((message) => {
              const mine = message.sender_type === "client";
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[80%] rounded-2xl px-3 py-2"
                    style={{
                      background: mine ? "var(--accent-primary)" : "var(--surface-2)",
                      color: mine ? "white" : "var(--text)",
                      border: mine ? "none" : "1px solid var(--border)",
                    }}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                    <p className="mt-1 text-[11px]" style={{ color: mine ? "rgba(255,255,255,0.8)" : "var(--text-3)" }}>
                      {formatDate(message.created_at, true)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <textarea
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              placeholder={readOnlyMode ? "Modo visualização: envio desativado" : "Escreve uma mensagem para a equipa..."}
              className="input min-h-[84px] flex-1"
              disabled={readOnlyMode || sendingMessage}
            />
            <button className="btn btn-primary self-end" onClick={sendMessage} disabled={readOnlyMode || sendingMessage || !messageInput.trim()}>
              {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </section>
      )}

      {activeTab === "calendar" && (
        <section className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Calendário do projeto</p>
            <CalendarDays className="h-4 w-4" style={{ color: "var(--text-3)" }} />
          </div>

          <div className="mt-2 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-2)" }}>
            Adiciona qualquer evento ao teu calendário com Google Calendar ou download ICS (Apple/Outlook).
          </div>

          <div className="mt-3 space-y-2">
            {calendarEntries.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem eventos para já.</p>
            ) : calendarEntries.map((entry) => (
              <div key={entry.id} className="rounded-xl border px-3 py-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{entry.title}</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>{formatDate(entry.startsAt, true)}</p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={toGoogleCalendarUrl(entry)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                    Google Calendar
                  </a>
                  <a href={buildQuickIcsUrl(entry)} className="btn btn-ghost btn-sm" download>
                    ICS (Apple/Outlook)
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
