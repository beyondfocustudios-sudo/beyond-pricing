"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  Bug,
  Check,
  ExternalLink,
  FileDown,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { buttonMotionProps, transitions, variants } from "@/lib/motion";
import { MotionList, MotionListItem, Pressable } from "@/components/motion-system";

type AssistantConfig = {
  enabled: boolean;
  role: "owner" | "admin" | "member" | "client" | "collaborator" | "unknown";
  ai: {
    enabled: boolean;
    configured: boolean;
    allowedForRole: boolean;
    weeklyLimit: number;
    usageCount: number;
    weekStart: string;
  };
};

type AssistantAction = {
  id: string;
  label: string;
  action: "create_task" | "find_project" | "open_item" | "report_bug" | "help_navigation";
  payload?: Record<string, unknown>;
};

type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  type: "project" | "client" | "task" | "message" | "deliverable" | "journal";
};

type SearchGroup = {
  key: string;
  label: string;
  items: SearchItem[];
};

type InterpretResponse = {
  intent: string;
  confidence: number;
  args: Record<string, unknown>;
  response: string;
  suggested_actions: AssistantAction[];
  source: "deterministic" | "ai";
  usage?: {
    count: number;
    limit: number;
  };
};

type CapturedError = {
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  ts: string;
};

type FailedRequest = {
  url: string;
  method: string;
  status?: number;
  error?: string;
  ts: string;
};

const MAX_CAPTURED_ERRORS = 8;
const MAX_CAPTURED_REQUESTS = 8;

export default function HQAssistantWidget() {
  const toast = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"actions" | "search" | "assistant">("actions");
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskCreating, setTaskCreating] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>([]);

  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantResult, setAssistantResult] = useState<InterpretResponse | null>(null);

  const [inviteClientEmail, setInviteClientEmail] = useState("");
  const [inviteClientId, setInviteClientId] = useState("");
  const [inviteClientRole, setInviteClientRole] = useState<"client_viewer" | "client_approver">("client_viewer");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [clientOptions, setClientOptions] = useState<Array<{ id: string; title: string }>>([]);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportDescription, setReportDescription] = useState("");
  const [reportExpected, setReportExpected] = useState("");
  const [reportSteps, setReportSteps] = useState("");
  const [reportSending, setReportSending] = useState(false);

  const capturedErrorsRef = useRef<CapturedError[]>([]);
  const failedRequestsRef = useRef<FailedRequest[]>([]);
  const [issueBadgeCount, setIssueBadgeCount] = useState(0);

  const isPortal = pathname.startsWith("/portal");
  const currentProjectId = useMemo(() => {
    const appMatch = pathname.match(/^\/app\/projects\/([^/]+)/);
    if (appMatch) return appMatch[1];
    const portalMatch = pathname.match(/^\/portal\/projects\/([^/]+)/);
    return portalMatch?.[1] ?? null;
  }, [pathname]);

  const isTeam = config?.role === "owner" || config?.role === "admin" || config?.role === "member";
  const isOwnerAdmin = config?.role === "owner" || config?.role === "admin";

  const bumpBadge = useCallback(() => {
    const count = Math.min(9, capturedErrorsRef.current.length + failedRequestsRef.current.length);
    setIssueBadgeCount(count);
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setConfigLoading(true);
      const res = await fetch("/api/assistant/config", { cache: "no-store" });
      if (!alive) return;

      if (!res.ok) {
        setConfig(null);
        setConfigLoading(false);
        return;
      }

      const json = (await res.json()) as AssistantConfig;
      setConfig(json);
      setConfigLoading(false);
    };

    void load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (configLoading || !config?.enabled) return;

    let disposed = false;
    const controller = new AbortController();

    const loadClients = async () => {
      if (!isOwnerAdmin || isPortal) return;
      const res = await fetch("/api/search?q=&limit=8", { cache: "no-store", signal: controller.signal });
      if (!res.ok || disposed) return;
      const json = (await res.json()) as { groups?: SearchGroup[] };
      const clients = (json.groups ?? [])
        .find((group) => group.key === "clients")
        ?.items.map((item) => ({ id: item.id, title: item.title })) ?? [];
      setClientOptions(clients);
      if (!inviteClientId && clients[0]?.id) {
        setInviteClientId(clients[0].id);
      }
    };

    void loadClients();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [config?.enabled, configLoading, inviteClientId, isOwnerAdmin, isPortal]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const next: CapturedError = {
        message: event.message || "Erro desconhecido",
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        ts: new Date().toISOString(),
      };
      capturedErrorsRef.current = [next, ...capturedErrorsRef.current].slice(0, MAX_CAPTURED_ERRORS);
      bumpBadge();
    };

    const onUnhandled = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "Unhandled rejection");
      const next: CapturedError = {
        message: reason,
        stack: event.reason instanceof Error ? event.reason.stack : undefined,
        ts: new Date().toISOString(),
      };
      capturedErrorsRef.current = [next, ...capturedErrorsRef.current].slice(0, MAX_CAPTURED_ERRORS);
      bumpBadge();
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      const method = String(init?.method ?? "GET").toUpperCase();
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      try {
        const response = await originalFetch(...args);
        if (!response.ok && !url.includes("/api/support/tickets")) {
          failedRequestsRef.current = [
            {
              url,
              method,
              status: response.status,
              ts: new Date().toISOString(),
            },
            ...failedRequestsRef.current,
          ].slice(0, MAX_CAPTURED_REQUESTS);
          bumpBadge();
        }
        return response;
      } catch (error) {
        failedRequestsRef.current = [
          {
            url,
            method,
            error: error instanceof Error ? error.message : String(error),
            ts: new Date().toISOString(),
          },
          ...failedRequestsRef.current,
        ].slice(0, MAX_CAPTURED_REQUESTS);
        bumpBadge();
        throw error;
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
      window.fetch = originalFetch;
    };
  }, [bumpBadge]);

  const runSearch = useCallback(async (value: string) => {
    if (!config?.enabled) return;
    setSearchLoading(true);

    const query = new URLSearchParams({
      q: value,
      limit: "5",
      ...(isPortal ? { scope: "portal" } : {}),
    });

    const res = await fetch(`/api/search?${query.toString()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { groups?: SearchGroup[]; error?: string };

    if (!res.ok) {
      toast.error(json.error ?? "Falha na pesquisa");
      setSearchLoading(false);
      return;
    }

    setSearchGroups(json.groups ?? []);
    setSearchLoading(false);
  }, [config?.enabled, isPortal, toast]);

  useEffect(() => {
    if (!open || activeTab !== "search" || !config?.enabled) return;
    const t = setTimeout(() => {
      void runSearch(searchQuery.trim());
    }, 220);
    return () => clearTimeout(t);
  }, [activeTab, config?.enabled, open, runSearch, searchQuery]);

  useEffect(() => {
    if (!open || !config?.enabled) return;
    void runSearch("");
  }, [config?.enabled, open, runSearch]);

  async function handleCreateTask() {
    if (!taskTitle.trim() || taskCreating) return;
    setTaskCreating(true);

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: taskTitle.trim(),
        priority: taskPriority,
        due_date: taskDueDate || null,
        project_id: currentProjectId,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { error?: string };

    if (!res.ok) {
      toast.error(json.error ?? "Erro ao criar tarefa");
      setTaskCreating(false);
      return;
    }

    setTaskTitle("");
    setTaskDueDate("");
    toast.success("Tarefa criada");
    setTaskCreating(false);
  }

  async function handleInviteClient() {
    if (!inviteClientEmail.trim() || !inviteClientId || inviteLoading) return;

    setInviteLoading(true);
    const res = await fetch("/api/clients/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: inviteClientId,
        email: inviteClientEmail.trim(),
        role: inviteClientRole,
        expiresInDays: 7,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { inviteUrl?: string; error?: string };

    if (!res.ok) {
      toast.error(json.error ?? "Falha ao convidar cliente");
      setInviteLoading(false);
      return;
    }

    if (json.inviteUrl) {
      await navigator.clipboard.writeText(json.inviteUrl);
      toast.success("Convite criado e copiado para clipboard");
    } else {
      toast.success("Convite criado");
    }

    setInviteClientEmail("");
    setInviteLoading(false);
  }

  async function handleGenerateReviewLink() {
    if (!currentProjectId) {
      toast.info("Abre um projeto para gerar review link.");
      return;
    }

    const res = await fetch("/api/assistant/actions/review-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: currentProjectId }),
    });

    const json = (await res.json().catch(() => ({}))) as { shareUrl?: string; error?: string };

    if (!res.ok) {
      toast.error(json.error ?? "Falha ao gerar link de review");
      return;
    }

    if (json.shareUrl) {
      await navigator.clipboard.writeText(json.shareUrl);
      toast.success("Review link copiado");
    }
  }

  async function handleRefreshPlugins() {
    if (!currentProjectId) {
      toast.info("Abre um projeto para atualizar plugins.");
      return;
    }

    const res = await fetch("/api/assistant/actions/refresh-plugins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: currentProjectId }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: { weather?: boolean; route?: boolean; fuel?: boolean };
      error?: string;
    };

    if (!res.ok) {
      toast.error(json.error ?? "Falha ao atualizar plugins");
      return;
    }

    const result = json.result ?? {};
    const text = `Tempo ${result.weather ? "ok" : "fail"} · Logística ${result.route ? "ok" : "fail"} · Combustível ${result.fuel ? "ok" : "fail"}`;
    toast.info(text);
  }

  async function runAssistant() {
    if (!assistantMessage.trim() || assistantLoading) return;

    setAssistantLoading(true);

    const res = await fetch("/api/assistant/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: assistantMessage.trim(),
        context_minimal: {
          route: pathname,
          project_id: currentProjectId,
          recent_errors: capturedErrorsRef.current.slice(0, 5),
          recent_failed_requests: failedRequestsRef.current.slice(0, 5),
        },
      }),
    });

    const json = (await res.json().catch(() => ({}))) as InterpretResponse & {
      error?: string;
      usage?: { count: number; limit: number; week_start?: string };
    };

    if (!res.ok && !json.response) {
      toast.error(json.error ?? "Assistente indisponível");
      setAssistantLoading(false);
      return;
    }

    setAssistantResult({
      intent: json.intent,
      confidence: json.confidence,
      args: json.args,
      response: json.response,
      suggested_actions: json.suggested_actions ?? [],
      source: json.source ?? "deterministic",
      usage: json.usage,
    });

    if (json.usage) {
      setConfig((prev) => prev
        ? {
            ...prev,
            ai: {
              ...prev.ai,
              usageCount: json.usage?.count ?? prev.ai.usageCount,
            },
          }
        : prev);
    }

    setAssistantLoading(false);
  }

  async function handleSuggestedAction(action: AssistantAction) {
    switch (action.action) {
      case "create_task": {
        const title = String(action.payload?.title ?? assistantResult?.args?.title ?? "").trim();
        if (title) setTaskTitle(title);
        setActiveTab("actions");
        break;
      }
      case "find_project": {
        const query = String(action.payload?.query ?? assistantResult?.args?.query ?? "");
        setSearchQuery(query);
        setActiveTab("search");
        break;
      }
      case "open_item": {
        const href = String(action.payload?.href ?? "").trim();
        if (href) {
          router.push(href);
          setOpen(false);
        } else {
          setActiveTab("search");
        }
        break;
      }
      case "report_bug": {
        setReportOpen(true);
        break;
      }
      default:
        toast.info("Ação disponível no separador Ações/Pesquisa.");
    }
  }

  async function submitReport() {
    if (reportSending) return;
    if (!reportDescription.trim() && !reportExpected.trim() && !reportSteps.trim()) {
      toast.error("Descreve o problema para criar o ticket.");
      return;
    }

    setReportSending(true);

    const payload = {
      title: reportDescription.trim().slice(0, 120),
      description: reportDescription.trim(),
      expected: reportExpected.trim(),
      steps: reportSteps.trim(),
      route: pathname,
      use_ai: Boolean(config?.ai.enabled && isTeam),
      metadata: {
        ts: new Date().toISOString(),
        user_role: config?.role ?? "unknown",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        language: typeof navigator !== "undefined" ? navigator.language : "unknown",
        console_errors: capturedErrorsRef.current,
        failed_requests: failedRequestsRef.current,
      },
    };

    const res = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => ({}))) as { ticket?: { id: string }; error?: string };

    if (!res.ok || !json.ticket?.id) {
      toast.error(json.error ?? "Falha ao reportar problema");
      setReportSending(false);
      return;
    }

    toast.success(`Ticket criado: ${json.ticket.id.slice(0, 8)}`);

    setReportOpen(false);
    setReportDescription("");
    setReportExpected("");
    setReportSteps("");
    setReportSending(false);
    capturedErrorsRef.current = [];
    failedRequestsRef.current = [];
    setIssueBadgeCount(0);
  }

  if (configLoading || !config?.enabled) return null;

  const tabs = [
    { id: "actions", label: "Ações", icon: Zap },
    { id: "search", label: "Pesquisa", icon: Search },
    { id: "assistant", label: "Assistente", icon: Bot },
  ] as const;

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[100] md:bottom-7 md:right-7">
        <motion.button
          aria-label="Open HQ Assistant"
          data-testid="hq-assistant-fab"
          className="relative inline-flex h-14 w-14 items-center justify-center rounded-full border"
          style={{
            background: "color-mix(in srgb, var(--surface) 82%, transparent)",
            borderColor: "var(--border-soft)",
            color: "var(--accent-primary)",
            boxShadow: "var(--shadow-lift), var(--shadow-inset)",
            backdropFilter: "blur(10px)",
          }}
          onClick={() => setOpen((prev) => !prev)}
          {...buttonMotionProps({ enabled: !reduceMotion, hoverY: -2 })}
        >
          <WandSparkles className="h-5 w-5" />
          {issueBadgeCount > 0 ? (
            <span
              className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold"
              style={{ background: "#ef4444", color: "#fff" }}
            >
              {issueBadgeCount > 1 ? issueBadgeCount : "1"}
            </span>
          ) : null}
        </motion.button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.aside
            initial={reduceMotion ? false : "initial"}
            animate={reduceMotion ? undefined : "animate"}
            exit={reduceMotion ? undefined : "exit"}
            variants={variants.modalEnter}
            className="fixed bottom-[5.6rem] right-4 z-[110] w-[min(96vw,420px)] overflow-hidden rounded-[26px] border"
            style={{
              borderColor: "var(--border-soft)",
              background: "color-mix(in srgb, var(--surface) 84%, transparent)",
              boxShadow: "var(--shadow-lift), var(--shadow-inset)",
              backdropFilter: "blur(14px)",
            }}
          >
            <header className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <div>
                <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>HQ Assistant v2</p>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Ações rápidas + pesquisa + AI</p>
              </div>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Fechar HQ Assistant">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                {tabs.map((tab) => (
                  <Pressable
                    key={tab.id}
                    className={`pill ${activeTab === tab.id ? "pill-active" : ""} inline-flex items-center gap-1.5 px-3 py-1.5 text-xs`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </Pressable>
                ))}
              </div>
            </div>

            <MotionList className="max-h-[68vh] overflow-y-auto px-4 py-3">
              {activeTab === "actions" ? (
                <section className="space-y-4" data-testid="hq-actions-tab">
                  {isTeam ? (
                    <MotionListItem className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Criar tarefa</p>
                      <div className="space-y-2">
                        <input
                          data-testid="hq-create-task-title"
                          className="input"
                          placeholder="Título da tarefa"
                          value={taskTitle}
                          onChange={(event) => setTaskTitle(event.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            className="input"
                            value={taskPriority}
                            onChange={(event) => setTaskPriority(event.target.value)}
                          >
                            <option value="low">Prioridade baixa</option>
                            <option value="medium">Prioridade média</option>
                            <option value="high">Prioridade alta</option>
                            <option value="urgent">Prioridade urgente</option>
                          </select>
                          <input
                            type="date"
                            className="input"
                            value={taskDueDate}
                            onChange={(event) => setTaskDueDate(event.target.value)}
                          />
                        </div>
                        <button
                          data-testid="hq-create-task-submit"
                          className="btn btn-primary w-full"
                          onClick={() => void handleCreateTask()}
                          disabled={taskCreating}
                        >
                          {taskCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Criar tarefa
                        </button>
                      </div>
                    </MotionListItem>
                  ) : null}

                  <MotionListItem className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Projetos rápidos</p>
                      <button className="pill px-2.5 py-1 text-[11px]" onClick={() => void runSearch("")}>Atualizar</button>
                    </div>

                    <div className="space-y-2">
                      {(searchGroups.find((group) => group.key === "projects")?.items ?? []).slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
                            {item.subtitle ? (
                              <p className="truncate text-[11px]" style={{ color: "var(--text-3)" }}>{item.subtitle}</p>
                            ) : null}
                          </div>
                          <Link className="pill px-2.5 py-1 text-[11px]" href={item.href} onClick={() => setOpen(false)}>
                            Abrir
                          </Link>
                        </div>
                      ))}
                      {(searchGroups.find((group) => group.key === "projects")?.items ?? []).length === 0 ? (
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>Sem projetos carregados. Abre Pesquisa para procurar.</p>
                      ) : null}
                    </div>
                  </MotionListItem>

                  {currentProjectId ? (
                    <MotionListItem className="grid grid-cols-1 gap-2">
                      <button className="btn btn-secondary justify-start" onClick={() => void handleGenerateReviewLink()}>
                        <ExternalLink className="h-4 w-4" />
                        Gerar link de review
                      </button>
                      {!isPortal ? (
                        <a className="btn btn-secondary justify-start" href={`/api/export/pptx?projectId=${currentProjectId}`} target="_blank" rel="noreferrer">
                          <FileDown className="h-4 w-4" />
                          Exportar PPTX do projeto
                        </a>
                      ) : null}
                      <button className="btn btn-secondary justify-start" onClick={() => void handleRefreshPlugins()}>
                        <RefreshCw className="h-4 w-4" />
                        Atualizar plugins agora
                      </button>
                    </MotionListItem>
                  ) : null}

                  {isOwnerAdmin && !isPortal ? (
                    <MotionListItem className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Convidar cliente</p>
                      <div className="space-y-2">
                        <select className="input" value={inviteClientId} onChange={(event) => setInviteClientId(event.target.value)}>
                          {clientOptions.length === 0 ? <option value="">Sem clientes</option> : null}
                          {clientOptions.map((client) => (
                            <option key={client.id} value={client.id}>{client.title}</option>
                          ))}
                        </select>
                        <input
                          className="input"
                          type="email"
                          placeholder="cliente@email.com"
                          value={inviteClientEmail}
                          onChange={(event) => setInviteClientEmail(event.target.value)}
                        />
                        <select className="input" value={inviteClientRole} onChange={(event) => setInviteClientRole(event.target.value as "client_viewer" | "client_approver")}>
                          <option value="client_viewer">Cliente Viewer</option>
                          <option value="client_approver">Cliente Approver</option>
                        </select>
                        <button className="btn btn-primary w-full" disabled={inviteLoading} onClick={() => void handleInviteClient()}>
                          {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Enviar convite
                        </button>
                      </div>
                    </MotionListItem>
                  ) : null}
                </section>
              ) : null}

              {activeTab === "search" ? (
                <section className="space-y-3" data-testid="hq-search-tab">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
                    <input
                      data-testid="hq-search-input"
                      className="input pl-9"
                      placeholder="Pesquisar projetos, clientes, tarefas..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>

                  {searchLoading ? (
                    <div className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      A pesquisar...
                    </div>
                  ) : null}

                  <div className="space-y-3" data-testid="hq-search-results">
                    {searchGroups.map((group) => (
                      <div key={group.key} className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>{group.label}</p>
                        {group.items.length === 0 ? (
                          <div className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)", background: "var(--surface-2)" }}>
                            Sem resultados
                          </div>
                        ) : (
                          group.items.map((item) => (
                            <div key={`${group.key}-${item.id}`} className="rounded-xl border p-2.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
                                  {item.subtitle ? <p className="truncate text-[11px]" style={{ color: "var(--text-3)" }}>{item.subtitle}</p> : null}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Link
                                    href={item.href}
                                    className="pill px-2.5 py-1 text-[11px]"
                                    onClick={() => setOpen(false)}
                                  >
                                    Abrir
                                  </Link>
                                  <button
                                    className="pill px-2.5 py-1 text-[11px]"
                                    onClick={async () => {
                                      const absolute = `${window.location.origin}${item.href}`;
                                      await navigator.clipboard.writeText(absolute);
                                      toast.success("Link copiado");
                                    }}
                                  >
                                    Copiar link
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeTab === "assistant" ? (
                <section className="space-y-3" data-testid="hq-assistant-tab">
                  <div className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <p className="mb-2 text-xs" style={{ color: "var(--text-3)" }}>
                      Intents suportadas: criar tarefa, procurar projeto, abrir item, reportar bug, ajuda de navegação.
                    </p>
                    <textarea
                      className="input min-h-[96px] rounded-2xl"
                      placeholder="Ex: cria tarefa para rever orçamento amanhã"
                      value={assistantMessage}
                      onChange={(event) => setAssistantMessage(event.target.value)}
                    />
                    <button
                      data-testid="hq-assistant-send"
                      className="btn btn-primary mt-2 w-full"
                      disabled={assistantLoading}
                      onClick={() => void runAssistant()}
                    >
                      {assistantLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Interpretar pedido
                    </button>

                    <p className="mt-2 text-[11px]" style={{ color: "var(--text-3)" }}>
                      Uso esta semana: {config.ai.usageCount}/{config.ai.weeklyLimit}
                    </p>
                    {!config.ai.enabled ? (
                      <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                        AI desativada para este perfil/org. Modo determinístico ativo.
                      </p>
                    ) : null}
                  </div>

                  {assistantResult ? (
                    <motion.div
                      initial={reduceMotion ? false : "initial"}
                      animate={reduceMotion ? undefined : "animate"}
                      variants={variants.fadeIn}
                      transition={transitions.smooth}
                      className="rounded-2xl border p-3"
                      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                          {assistantResult.source === "ai" ? "Assistente AI" : "Assistente determinístico"}
                        </p>
                        <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                          {Math.round((assistantResult.confidence || 0) * 100)}% confiança
                        </span>
                      </div>

                      <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
                        {assistantResult.response}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {assistantResult.suggested_actions.map((action) => (
                          <button
                            key={action.id}
                            className="pill px-3 py-1.5 text-xs"
                            onClick={() => void handleSuggestedAction(action)}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                </section>
              ) : null}
            </MotionList>

            <footer className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <button
                data-testid="hq-report-bug"
                className="btn btn-secondary w-full justify-center"
                onClick={() => setReportOpen(true)}
              >
                <Bug className="h-4 w-4" />
                Reportar problema
              </button>
            </footer>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {reportOpen ? (
          <motion.div
            initial={reduceMotion ? false : "initial"}
            animate={reduceMotion ? undefined : "animate"}
            exit={reduceMotion ? undefined : "exit"}
            variants={variants.fadeIn}
            className="fixed inset-0 z-[120] grid place-items-center bg-black/35 px-4"
            onClick={() => setReportOpen(false)}
          >
            <motion.div
              initial={reduceMotion ? false : "initial"}
              animate={reduceMotion ? undefined : "animate"}
              exit={reduceMotion ? undefined : "exit"}
              variants={variants.modalEnter}
              transition={transitions.soft}
              className="w-full max-w-lg rounded-[24px] border p-4"
              style={{
                borderColor: "var(--border-soft)",
                background: "color-mix(in srgb, var(--surface) 90%, transparent)",
                boxShadow: "var(--shadow-lift)",
                backdropFilter: "blur(12px)",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.09em]" style={{ color: "var(--text-3)" }}>Support Ticket</p>
                  <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>Reportar problema</h3>
                </div>
                <button className="icon-btn" onClick={() => setReportOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2.5">
                <textarea
                  className="input min-h-[92px] rounded-2xl"
                  placeholder="Descreve o que aconteceu"
                  value={reportDescription}
                  onChange={(event) => setReportDescription(event.target.value)}
                />
                <textarea
                  className="input min-h-[72px] rounded-2xl"
                  placeholder="O que esperavas que acontecesse?"
                  value={reportExpected}
                  onChange={(event) => setReportExpected(event.target.value)}
                />
                <textarea
                  className="input min-h-[72px] rounded-2xl"
                  placeholder="Passos para reproduzir (se souberes)"
                  value={reportSteps}
                  onChange={(event) => setReportSteps(event.target.value)}
                />

                <div className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-3)" }}>
                  <p className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Logs automáticos anexados: rota atual, erros de consola e requests falhados.</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button className="btn btn-ghost" onClick={() => setReportOpen(false)}>Cancelar</button>
                  <button
                    data-testid="hq-report-submit"
                    className="btn btn-primary"
                    disabled={reportSending}
                    onClick={() => void submitReport()}
                  >
                    {reportSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Criar ticket
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
