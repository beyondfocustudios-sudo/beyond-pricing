"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, Search, Send, FolderOpen, Info } from "lucide-react";
import {
  getClientProjects,
  getConversationForProject,
  getMessages,
  getProjectDeliverables,
  getProjectMilestones,
  sendConversationMessage,
  type PortalDeliverable,
  type PortalMessage,
  type PortalMilestone,
  type PortalProject,
} from "@/lib/portal-data";

type RightTab = "inbox" | "milestones" | "info";

export default function PortalProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const selectedFromUrl = searchParams.get("selected") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [selectedId, setSelectedId] = useState<string>(selectedFromUrl);

  const [deliveries, setDeliveries] = useState<PortalDeliverable[]>([]);
  const [milestones, setMilestones] = useState<PortalMilestone[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("inbox");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await getClientProjects();
        if (cancelled) return;
        setProjects(list);
        const nextSelected = selectedFromUrl || list[0]?.id || "";
        setSelectedId(nextSelected);
      } catch {
        if (!cancelled) setError("Falha ao carregar projetos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedFromUrl]);

  useEffect(() => {
    if (!selectedId) return;
    const params = new URLSearchParams(searchKey);
    params.set("selected", selectedId);
    const next = params.toString();
    const current = searchKey;
    if (next !== current) {
      router.replace(`/portal/projects?${next}`, { scroll: false });
    }
  }, [selectedId, router, searchKey]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    const loadDetail = async () => {
      const [projectDeliveries, projectMilestones, conv] = await Promise.all([
        getProjectDeliverables(selectedId),
        getProjectMilestones(selectedId),
        getConversationForProject(selectedId),
      ]);
      const conversationMessages = conv ? await getMessages(conv) : [];

      if (cancelled) return;
      setDeliveries(projectDeliveries);
      setMilestones(projectMilestones);
      setConversationId(conv);
      setMessages(conversationMessages);
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filteredProjects = useMemo(() => {
    if (!query) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(query));
  }, [projects, query]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? filteredProjects[0] ?? null,
    [projects, selectedId, filteredProjects],
  );

  const handleSend = async () => {
    if (!conversationId || !messageInput.trim() || sending) return;
    setSending(true);
    const ok = await sendConversationMessage(conversationId, messageInput.trim());
    if (ok) {
      setMessageInput("");
      setMessages(await getMessages(conversationId));
    }
    setSending(false);
  };

  if (loading) {
    return <div className="skeleton h-[72vh] rounded-3xl" />;
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
    <div className="grid min-w-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
      <section className="card min-h-[65vh] p-4 lg:h-[calc(100dvh-180px)] lg:overflow-y-auto">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Projetos</h2>
          <span className="pill text-[11px]">{filteredProjects.length}</span>
        </div>

        <label className="table-search-pill mb-3">
          <Search className="h-3.5 w-3.5" />
          <input
            placeholder="Filtrar projetos"
            value={query}
            readOnly
            aria-label="Filtro do topo"
          />
        </label>

        <div className="space-y-2">
          {filteredProjects.map((project) => (
            <button
              key={project.id}
              className="card card-hover w-full p-3 text-left"
              onClick={() => setSelectedId(project.id)}
              style={{
                borderColor: selectedProject?.id === project.id ? "rgba(26,143,163,0.35)" : "var(--border)",
                background: selectedProject?.id === project.id ? "rgba(26,143,163,0.09)" : "var(--surface)",
              }}
            >
              <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{project.name}</p>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>{new Date(project.updated_at).toLocaleDateString("pt-PT")}</p>
            </button>
          ))}

          {filteredProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
              Sem projetos para o filtro atual.
            </div>
          ) : null}
        </div>
      </section>

      <section className="card min-w-0 min-h-[65vh] p-5 lg:h-[calc(100dvh-180px)] lg:overflow-y-auto">
        {selectedProject ? (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.12em]" style={{ color: "var(--text-3)" }}>Projeto selecionado</p>
                <h3 className="truncate text-xl font-semibold" style={{ color: "var(--text)" }}>{selectedProject.name}</h3>
              </div>
              <Link href={`/portal/projects/${selectedProject.id}`} className="btn btn-primary btn-sm">Abrir</Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>Entregas</p>
                <p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{deliveries.length}</p>
                <Link href={`/portal/projects/${selectedProject.id}?tab=deliveries`} className="text-xs" style={{ color: "var(--accent-blue)" }}>Ver entregas</Link>
              </article>
              <article className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>Milestones</p>
                <p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{milestones.length}</p>
                <Link href={`/portal/projects/${selectedProject.id}?tab=calendar`} className="text-xs" style={{ color: "var(--accent-blue)" }}>Abrir timeline</Link>
              </article>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs uppercase tracking-[0.12em]" style={{ color: "var(--text-3)" }}>Últimas entregas</p>
              {deliveries.slice(0, 4).map((delivery) => (
                <Link key={delivery.id} href={`/portal/projects/${selectedProject.id}?tab=deliveries`} className="flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <span className="truncate text-sm" style={{ color: "var(--text)" }}>{delivery.title}</span>
                  <span className="pill text-[11px]">{delivery.status ?? "novo"}</span>
                </Link>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setRightTab("inbox")}>Enviar mensagem</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setRightTab("milestones")}>Ver milestones</button>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--text-3)" }}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Seleciona um projeto
          </div>
        )}
      </section>

      <aside className="card min-h-[65vh] p-4 lg:h-[calc(100dvh-180px)] lg:overflow-y-auto">
        <div className="mb-3 flex items-center gap-2">
          {(["inbox", "milestones", "info"] as RightTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setRightTab(tab)}
              className="pill px-3 py-1 text-[11px]"
              style={{
                background: rightTab === tab ? "rgba(26,143,163,0.16)" : "var(--surface-2)",
                color: rightTab === tab ? "var(--accent-blue)" : "var(--text-3)",
              }}
            >
              {tab === "inbox" ? "Inbox" : tab === "milestones" ? "Milestones" : "Info"}
            </button>
          ))}
        </div>

        {rightTab === "inbox" ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
              {messages.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                  Sem mensagens ainda.
                </p>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className="rounded-2xl px-3 py-2 text-sm"
                    style={{
                      background: message.sender_type === "client" ? "var(--surface-2)" : "rgba(26,143,163,0.16)",
                      color: "var(--text)",
                    }}
                  >
                    {message.body}
                    <p className="mt-1 text-[10px]" style={{ color: "var(--text-3)" }}>
                      {new Date(message.created_at).toLocaleString("pt-PT")}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 flex items-end gap-2">
              <textarea
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder="Escreve uma mensagem"
                className="input min-h-[74px] flex-1"
              />
              <button className="btn btn-primary btn-sm" onClick={() => void handleSend()} disabled={sending || !messageInput.trim()}>
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {rightTab === "milestones" ? (
          <div className="space-y-2">
            {milestones.map((milestone) => (
              <div key={milestone.id} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{milestone.title}</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>{milestone.phase ?? "fase"} • {milestone.due_date ? new Date(milestone.due_date).toLocaleDateString("pt-PT") : "sem data"}</p>
              </div>
            ))}
          </div>
        ) : null}

        {rightTab === "info" && selectedProject ? (
          <div className="space-y-3">
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>Projeto</p>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{selectedProject.name}</p>
            </div>
            <Link href={`/portal/projects/${selectedProject.id}?tab=approvals`} className="btn btn-secondary btn-sm w-full">
              <Info className="h-4 w-4" />
              Pedir alteração
            </Link>
            <Link href={`/portal/inbox?project=${selectedProject.id}`} className="btn btn-primary btn-sm w-full">
              <MessageSquare className="h-4 w-4" />
              Abrir conversa
            </Link>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
