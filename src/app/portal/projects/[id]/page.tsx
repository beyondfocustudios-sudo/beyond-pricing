"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Info,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  TriangleAlert,
} from "lucide-react";
import {
  getConversationForProject,
  getMessages,
  getProjectDeliverables,
  getProjectMilestones,
  sendConversationMessage,
  type PortalDeliverable,
  type PortalMessage,
  type PortalMilestone,
} from "@/lib/portal-data";
import { createClient } from "@/lib/supabase";

type ProjectRow = {
  id: string;
  project_name: string;
  status: string | null;
  description?: string | null;
  updated_at: string;
};

type RequestRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  created_at: string;
};

type PageTab = "overview" | "deliveries" | "inbox" | "calendar" | "approvals";

const TAB_LABELS: Record<PageTab, string> = {
  overview: "Overview",
  deliveries: "Entregas",
  inbox: "Inbox",
  calendar: "Calendário",
  approvals: "Aprovações",
};

function sanitizeTab(value: string | null): PageTab {
  const allowed: PageTab[] = ["overview", "deliveries", "inbox", "calendar", "approvals"];
  return allowed.includes((value ?? "") as PageTab) ? (value as PageTab) : "overview";
}

function buildGoogleLink(title: string, startIso: string, endIso: string, details?: string) {
  const start = new Date(startIso).toISOString().replace(/[-:]/g, "").replace(".000", "");
  const end = new Date(endIso).toISOString().replace(/[-:]/g, "").replace(".000", "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
  });
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toIcsLink(title: string, startIso: string, endIso: string, description?: string) {
  const params = new URLSearchParams({ title, start: startIso, end: endIso });
  if (description) params.set("description", description);
  return `/api/calendar/event.ics?${params.toString()}`;
}

export default function PortalProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const projectId = params.id;
  const tab = sanitizeTab(searchParams.get("tab"));
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [deliveries, setDeliveries] = useState<PortalDeliverable[]>([]);
  const [milestones, setMilestones] = useState<PortalMilestone[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);

  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);

  const [requestForm, setRequestForm] = useState({
    title: "",
    description: "",
    type: "general",
    priority: "medium",
  });
  const [requestSending, setRequestSending] = useState(false);

  const setTab = (nextTab: PageTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`/portal/projects/${projectId}?${params.toString()}`, { scroll: false });
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: projectRow, error: projectError } = await supabase
        .from("projects")
        .select("id, project_name, status, description, updated_at")
        .eq("id", projectId)
        .maybeSingle();

      if (projectError || !projectRow) {
        setError("Projeto não encontrado.");
        setLoading(false);
        return;
      }

      const [projectDeliveries, projectMilestones, convId, requestsRes] = await Promise.all([
        getProjectDeliverables(projectId),
        getProjectMilestones(projectId),
        getConversationForProject(projectId),
        fetch(`/api/portal/requests?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" }),
      ]);

      const requestRows = requestsRes.ok
        ? ((await requestsRes.json().catch(() => [])) as RequestRow[])
        : [];
      const conversationMessages = convId ? await getMessages(convId) : [];

      setProject(projectRow as ProjectRow);
      setDeliveries(projectDeliveries);
      setMilestones(projectMilestones);
      setConversationId(convId);
      setMessages(conversationMessages);
      setRequests(requestRows);
      setSelectedDeliveryId((previous) => previous ?? projectDeliveries[0]?.id ?? null);
    } catch {
      setError("Falha ao carregar dados do projeto.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filteredDeliveries = useMemo(() => {
    if (!query) return deliveries;
    return deliveries.filter((delivery) => {
      const haystack = `${delivery.title} ${delivery.file_type ?? ""} ${delivery.status ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [deliveries, query]);

  const filteredMessages = useMemo(() => {
    if (!query) return messages;
    return messages.filter((message) => message.body.toLowerCase().includes(query));
  }, [messages, query]);

  const selectedDelivery = useMemo(
    () => filteredDeliveries.find((delivery) => delivery.id === selectedDeliveryId) ?? filteredDeliveries[0] ?? null,
    [filteredDeliveries, selectedDeliveryId],
  );

  const submitMessage = async () => {
    if (!conversationId || !messageInput.trim() || sending) return;
    setSending(true);
    const ok = await sendConversationMessage(conversationId, messageInput.trim());
    if (ok) {
      setMessageInput("");
      setMessages(await getMessages(conversationId));
    }
    setSending(false);
  };

  const submitRequest = async () => {
    if (!requestForm.title.trim() || requestSending) return;
    setRequestSending(true);
    const res = await fetch("/api/portal/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...requestForm }),
    });

    if (res.ok) {
      setRequestForm({ title: "", description: "", type: "general", priority: "medium" });
      const listRes = await fetch(`/api/portal/requests?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      if (listRes.ok) {
        const nextRows = (await listRes.json().catch(() => [])) as RequestRow[];
        setRequests(nextRows);
      }
      setTab("approvals");
    }
    setRequestSending(false);
  };

  if (loading) {
    return <div className="skeleton h-[72vh] rounded-3xl" />;
  }

  if (error || !project) {
    return (
      <div className="card p-6">
        <p className="text-sm" style={{ color: "var(--error)" }}>{error ?? "Projeto indisponível."}</p>
        <button className="btn btn-secondary mt-3" onClick={() => void loadAll()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>Projeto</p>
            <h1 className="truncate text-[1.35rem] font-semibold" style={{ color: "var(--text)" }}>{project.project_name}</h1>
            <p className="text-sm" style={{ color: "var(--text-2)" }}>{project.description || "Resumo e colaboração centralizados."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TAB_LABELS) as PageTab[]).map((item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className="pill px-3 py-1.5 text-xs"
                style={{
                  background: tab === item ? "rgba(26,143,163,0.16)" : "var(--surface-2)",
                  color: tab === item ? "var(--accent-blue)" : "var(--text-3)",
                }}
              >
                {TAB_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="card min-w-0 p-5">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Resumo</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>Entregas</p>
                <p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{deliveries.length}</p>
              </article>
              <article className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>Milestones</p>
                <p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{milestones.length}</p>
              </article>
              <article className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>Mensagens</p>
                <p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{messages.length}</p>
              </article>
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>Últimas atualizações</p>
              {deliveries.slice(0, 4).map((delivery) => (
                <div key={delivery.id} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{delivery.title}</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>{new Date(delivery.created_at).toLocaleString("pt-PT")}</p>
                </div>
              ))}
            </div>
          </section>

          <aside className="card p-5">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Próximo passo</h3>
            {milestones[0] ? (
              <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{milestones[0].title}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                  {milestones[0].due_date ? new Date(milestones[0].due_date).toLocaleDateString("pt-PT") : "Sem data"}
                </p>
                {milestones[0].due_date ? (
                  <div className="mt-3 flex gap-2">
                    <a className="btn btn-secondary btn-sm" href={buildGoogleLink(milestones[0].title, milestones[0].due_date, milestones[0].due_date, milestones[0].description ?? undefined)} target="_blank" rel="noreferrer">
                      Google
                    </a>
                    <a className="btn btn-ghost btn-sm" href={toIcsLink(milestones[0].title, milestones[0].due_date, milestones[0].due_date, milestones[0].description ?? undefined)}>
                      ICS
                    </a>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs" style={{ color: "var(--text-3)" }}>Sem milestones definidas.</p>
            )}
          </aside>
        </div>
      ) : null}

      {tab === "deliveries" ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section className="card min-h-[62vh] p-4 lg:h-[calc(100dvh-220px)] lg:overflow-y-auto">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Entregas</h2>
              <span className="pill text-[11px]">{filteredDeliveries.length}</span>
            </div>

            <label className="table-search-pill mb-3">
              <Search className="h-3.5 w-3.5" />
              <input readOnly value={query} placeholder="Usa a pesquisa no topo" />
            </label>

            <div className="space-y-2">
              {filteredDeliveries.map((delivery) => (
                <button
                  key={delivery.id}
                  onClick={() => setSelectedDeliveryId(delivery.id)}
                  className="card card-hover w-full p-3 text-left"
                  style={{
                    borderColor: selectedDelivery?.id === delivery.id ? "rgba(26,143,163,0.35)" : "var(--border)",
                    background: selectedDelivery?.id === delivery.id ? "rgba(26,143,163,0.08)" : "var(--surface)",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{delivery.title}</p>
                      <p className="text-xs" style={{ color: "var(--text-3)" }}>
                        {delivery.file_type ?? "ficheiro"} • {new Date(delivery.created_at).toLocaleDateString("pt-PT")}
                      </p>
                    </div>
                    <span className="pill text-[10px]">{delivery.status ?? "novo"}</span>
                  </div>
                </button>
              ))}

              {filteredDeliveries.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                  Sem entregas para este filtro.
                </p>
              ) : null}
            </div>
          </section>

          <section className="card min-w-0 min-h-[62vh] p-5 lg:h-[calc(100dvh-220px)] lg:overflow-y-auto">
            {selectedDelivery ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.11em]" style={{ color: "var(--text-3)" }}>Preview</p>
                    <h3 className="truncate text-xl font-semibold" style={{ color: "var(--text)" }}>{selectedDelivery.title}</h3>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      {selectedDelivery.file_type ?? "ficheiro"} • {new Date(selectedDelivery.created_at).toLocaleString("pt-PT")}
                    </p>
                  </div>
                  <Link href={`/portal/review/${selectedDelivery.id}`} className="btn btn-secondary btn-sm">Abrir Aprovações</Link>
                </div>

                <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  {(selectedDelivery.file_type ?? "").includes("video") ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
                      <Film className="h-4 w-4" />
                      Vídeo disponível para revisão
                    </div>
                  ) : (selectedDelivery.file_type ?? "").includes("image") ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
                      <ImageIcon className="h-4 w-4" />
                      Imagem disponível
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
                      <FileText className="h-4 w-4" />
                      Documento disponível
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedDelivery.dropbox_url ? (
                      <a className="btn btn-primary btn-sm" href={selectedDelivery.dropbox_url} target="_blank" rel="noreferrer">
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    ) : null}
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      setTab("approvals");
                      setRequestForm((prev) => ({ ...prev, title: `Alteração: ${selectedDelivery.title}` }));
                    }}>
                      <TriangleAlert className="h-4 w-4" />
                      Pedir alteração
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setTab("inbox");
                      setMessageInput(`Sobre ${selectedDelivery.title}: `);
                    }}>
                      <MessageSquare className="h-4 w-4" />
                      Enviar mensagem
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-3)" }}>Seleciona uma entrega.</p>
            )}
          </section>
        </div>
      ) : null}

      {tab === "inbox" ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <section className="card min-h-[62vh] p-4 lg:h-[calc(100dvh-220px)] lg:overflow-y-auto">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Thread do projeto</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
              Conversa centralizada com a equipa.
            </p>
            <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{project.project_name}</p>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>{messages.length} mensagens</p>
              <Link href={`/portal/inbox?project=${projectId}`} className="btn btn-ghost btn-sm mt-2">
                Abrir inbox dedicada
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <section className="card min-w-0 min-h-[62vh] p-4 lg:h-[calc(100dvh-220px)] lg:overflow-hidden">
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {filteredMessages.map((message) => (
                  <article key={message.id} className="rounded-2xl px-3 py-2" style={{
                    background: message.sender_type === "client" ? "var(--surface-2)" : "rgba(26,143,163,0.14)",
                  }}>
                    <p className="text-sm" style={{ color: "var(--text)" }}>{message.body}</p>
                    <p className="mt-1 text-[10px]" style={{ color: "var(--text-3)" }}>{new Date(message.created_at).toLocaleString("pt-PT")}</p>
                  </article>
                ))}
                {filteredMessages.length === 0 ? (
                  <p className="rounded-xl border border-dashed px-3 py-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                    Sem mensagens neste projeto.
                  </p>
                ) : null}
              </div>

              <div className="mt-3 flex items-end gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                <textarea
                  className="input min-h-[72px] flex-1"
                  placeholder="Escrever mensagem"
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                />
                <button className="btn btn-secondary btn-sm" type="button" title="Anexar link">
                  <Paperclip className="h-4 w-4" />
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => void submitMessage()} disabled={sending || !messageInput.trim()}>
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "calendar" ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="card min-h-[62vh] p-5 lg:h-[calc(100dvh-220px)] lg:overflow-y-auto">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Timeline do projeto</h2>
            <div className="mt-4 space-y-3">
              {milestones.map((milestone) => {
                const due = milestone.due_date ? new Date(milestone.due_date) : null;
                const startIso = due ? due.toISOString() : new Date().toISOString();
                const endIso = due ? new Date(due.getTime() + 30 * 60 * 1000).toISOString() : new Date(Date.now() + 30 * 60 * 1000).toISOString();
                return (
                  <article key={milestone.id} className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{milestone.title}</p>
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>
                          {milestone.phase ?? "Fase"} • {due ? due.toLocaleDateString("pt-PT") : "Sem data"}
                        </p>
                      </div>
                      <span className="pill text-[10px]">{milestone.status ?? "pending"}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <a className="btn btn-secondary btn-sm" href={buildGoogleLink(milestone.title, startIso, endIso, milestone.description ?? undefined)} target="_blank" rel="noreferrer">
                        <CalendarDays className="h-4 w-4" />
                        Add to Google
                      </a>
                      <a className="btn btn-ghost btn-sm" href={toIcsLink(milestone.title, startIso, endIso, milestone.description ?? undefined)}>
                        <Download className="h-4 w-4" />
                        Download ICS
                      </a>
                    </div>
                  </article>
                );
              })}

              {milestones.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                  Sem marcos definidos neste projeto.
                </p>
              ) : null}
            </div>
          </section>

          <aside className="card min-h-[62vh] p-5 lg:h-[calc(100dvh-220px)] lg:overflow-y-auto">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Discussão rápida</h3>
            <div className="mt-3 space-y-2">
              {messages.slice(-6).map((message) => (
                <div key={message.id} className="rounded-xl px-3 py-2" style={{ background: "var(--surface-2)" }}>
                  <p className="line-clamp-2 text-xs" style={{ color: "var(--text)" }}>{message.body}</p>
                  <p className="mt-1 text-[10px]" style={{ color: "var(--text-3)" }}>{new Date(message.created_at).toLocaleDateString("pt-PT")}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      {tab === "approvals" ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="card min-h-[62vh] p-5 lg:h-[calc(100dvh-220px)] lg:overflow-y-auto">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Pedidos e Aprovações</h2>
            <div className="mt-4 space-y-2">
              {requests.map((request) => (
                <article key={request.id} className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{request.title}</p>
                    <span className="pill text-[10px]">{request.status}</span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                    {request.type} • {request.priority} • {new Date(request.created_at).toLocaleString("pt-PT")}
                  </p>
                  {request.description ? (
                    <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>{request.description}</p>
                  ) : null}
                </article>
              ))}

              {requests.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                  Sem pedidos ainda.
                </p>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm">
                <CheckCircle2 className="h-4 w-4" />
                Aprovar versão
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setTab("inbox")}>
                <Clock3 className="h-4 w-4" />
                Pedir alterações
              </button>
            </div>
          </section>

          <aside className="card min-h-[62vh] p-5 lg:h-[calc(100dvh-220px)] lg:overflow-y-auto">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Novo pedido</h3>
            <div className="mt-3 space-y-2">
              <input
                className="input"
                placeholder="Título"
                value={requestForm.title}
                onChange={(event) => setRequestForm((prev) => ({ ...prev, title: event.target.value }))}
              />
              <textarea
                className="input min-h-[120px]"
                placeholder="Descreve a alteração"
                value={requestForm.description}
                onChange={(event) => setRequestForm((prev) => ({ ...prev, description: event.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <select className="input" value={requestForm.type} onChange={(event) => setRequestForm((prev) => ({ ...prev, type: event.target.value }))}>
                  <option value="general">Geral</option>
                  <option value="cut">Corte</option>
                  <option value="color">Cor</option>
                  <option value="text">Texto</option>
                  <option value="sound">Som</option>
                  <option value="branding">Branding</option>
                </select>
                <select className="input" value={requestForm.priority} onChange={(event) => setRequestForm((prev) => ({ ...prev, priority: event.target.value }))}>
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>

              <button className="btn btn-primary btn-sm w-full" onClick={() => void submitRequest()} disabled={requestSending || !requestForm.title.trim()}>
                {requestSending ? "A enviar..." : "Enviar pedido"}
              </button>

              <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
                O pedido aparece na inbox e no feed da equipa.
              </p>
            </div>

            <Link href={`/portal/presentation/${projectId}`} className="btn btn-ghost btn-sm mt-4 w-full">
              <Info className="h-4 w-4" />
              Modo apresentação
            </Link>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
