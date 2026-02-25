"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  Package,
  Search,
  Send,
  Star,
} from "lucide-react";
import { buttonMotionProps, useMotionEnabled, variants } from "@/lib/motion";

type TabId = "overview" | "deliveries" | "approvals" | "brand_kit" | "documents" | "references" | "inbox" | "calendar";

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
  attachments?: Array<{ type?: string; url?: string }>;
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

type BrandKitVersion = {
  id: string;
  version_number: number;
  summary?: string | null;
  created_at: string;
};

type BrandKitState = {
  id?: string;
  title: string;
  logos: string[];
  guidelines: string;
  applyPortalAccent: boolean;
  accentLight: string;
  accentDark: string;
  autoAdjusted: boolean;
  colors: Array<{ name: string; hex: string }>;
  fonts: Array<{ name: string; usage?: string }>;
  assets: Array<{ assetType: string; label?: string; fileUrl: string }>;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "deliveries", label: "Entregas" },
  { id: "approvals", label: "Aprovações" },
  { id: "brand_kit", label: "Brand Kit" },
  { id: "documents", label: "Documentos" },
  { id: "references", label: "Referências" },
  { id: "inbox", label: "Inbox" },
  { id: "calendar", label: "Calendário" },
];

const TAB_SET = new Set<TabId>(TABS.map((tab) => tab.id));

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

function parseTab(value: string | null): TabId {
  if (!value) return "overview";
  return TAB_SET.has(value as TabId) ? (value as TabId) : "overview";
}

function useDebouncedValue<T>(value: T, delay = 260) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function createDefaultBrandKit(): BrandKitState {
  return {
    title: "Brand Kit",
    logos: [],
    guidelines: "",
    applyPortalAccent: false,
    accentLight: "#1A8FA3",
    accentDark: "#63C7D7",
    autoAdjusted: false,
    colors: [],
    fonts: [],
    assets: [],
  };
}

export default function PortalProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const motionEnabled = useMotionEnabled();

  const impersonationToken = searchParams.get("impersonate");
  const tabFromQuery = parseTab(searchParams.get("tab"));
  const [activeTab, setActiveTab] = useState<TabId>(tabFromQuery);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 260);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string | null>(null);
  const [messageLink, setMessageLink] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

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
  const [savingBrandKit, setSavingBrandKit] = useState(false);
  const [brandKitMessage, setBrandKitMessage] = useState<string | null>(null);
  const [brandKit, setBrandKit] = useState<BrandKitState>(createDefaultBrandKit());
  const [brandVersions, setBrandVersions] = useState<BrandKitVersion[]>([]);
  const [calendlyUrl, setCalendlyUrl] = useState<string | null>(process.env.NEXT_PUBLIC_CALENDLY_URL ?? null);
  const [callReason, setCallReason] = useState("");

  const readOnlyMode = Boolean(impersonationToken);

  const setTab = useCallback(
    (nextTab: TabId) => {
      setActiveTab(nextTab);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", nextTab);
      router.replace(`/portal/projects/${id}?${params.toString()}`, { scroll: false });
    },
    [id, router, searchParams],
  );

  useEffect(() => {
    if (tabFromQuery !== activeTab) {
      setActiveTab(tabFromQuery);
    }
  }, [activeTab, tabFromQuery]);

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
    setBrandKit(createDefaultBrandKit());
    setBrandVersions([]);
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

    const [milestonesRes, deliverablesRes, filesRes, requestsRes, briefRes, conversationRes, brandRes, orgSettingsRes] = await Promise.all([
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
      fetch(`/api/portal/brand-kit?projectId=${id}`, { cache: "no-store" }),
      supabase
        .from("org_settings")
        .select("calendly_url")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
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

    if (brandRes.ok) {
      const brandPayload = (await brandRes.json().catch(() => ({}))) as {
        kit?: {
          id?: string;
          title?: string | null;
          logos?: string[] | null;
          notes?: string | null;
          apply_portal_accent?: boolean | null;
          accent_light?: string | null;
          accent_dark?: string | null;
          auto_adjusted?: boolean | null;
        } | null;
        colors?: Array<{ name?: string | null; hex?: string | null }>;
        fonts?: Array<{ name?: string | null; usage?: string | null }>;
        assets?: Array<{ asset_type?: string | null; label?: string | null; file_url?: string | null }>;
        versions?: Array<{ id: string; version_number: number; summary?: string | null; created_at: string }>;
      };

      const defaults = createDefaultBrandKit();
      const mappedBrand: BrandKitState = {
        ...defaults,
        id: brandPayload.kit?.id,
        title: String(brandPayload.kit?.title ?? defaults.title),
        logos: (brandPayload.kit?.logos ?? []).map((logo) => String(logo)).filter(Boolean),
        guidelines: String(brandPayload.kit?.notes ?? defaults.guidelines),
        applyPortalAccent: Boolean(brandPayload.kit?.apply_portal_accent ?? defaults.applyPortalAccent),
        accentLight: String(brandPayload.kit?.accent_light ?? defaults.accentLight),
        accentDark: String(brandPayload.kit?.accent_dark ?? defaults.accentDark),
        autoAdjusted: Boolean(brandPayload.kit?.auto_adjusted ?? defaults.autoAdjusted),
        colors: (brandPayload.colors ?? [])
          .map((entry) => ({ name: String(entry.name ?? "").trim(), hex: String(entry.hex ?? "").trim() }))
          .filter((entry) => Boolean(entry.hex)),
        fonts: (brandPayload.fonts ?? [])
          .map((entry) => ({ name: String(entry.name ?? "").trim(), usage: String(entry.usage ?? "").trim() }))
          .filter((entry) => Boolean(entry.name)),
        assets: (brandPayload.assets ?? [])
          .map((entry) => ({ assetType: String(entry.asset_type ?? "logo").trim() || "logo", label: String(entry.label ?? "").trim(), fileUrl: String(entry.file_url ?? "").trim() }))
          .filter((entry) => Boolean(entry.fileUrl)),
      };

      setBrandKit(mappedBrand);
      setBrandVersions(brandPayload.versions ?? []);
    } else {
      setBrandKit(createDefaultBrandKit());
      setBrandVersions([]);
    }

    setCalendlyUrl(String(orgSettingsRes.data?.calendly_url ?? process.env.NEXT_PUBLIC_CALENDLY_URL ?? "").trim() || null);
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

    const shootDays: CalendarEntry[] = (project?.shoot_days ?? []).map((day, index) => {
      const start = new Date(`${day}T08:00:00.000Z`).toISOString();
      const end = new Date(`${day}T18:00:00.000Z`).toISOString();
      return {
        id: `s-${index}-${day}`,
        title: `Shoot Day ${index + 1}`,
        startsAt: start,
        endsAt: end,
        description: "Dia de rodagem",
        location: null,
        source: "shoot_day",
      };
    });

    return [...fromMilestones, ...shootDays].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [milestones, project?.shoot_days]);

  const searchTerm = debouncedSearch.trim().toLowerCase();

  const filteredDeliverables = useMemo(() => {
    if (!searchTerm) return deliverables;
    return deliverables.filter((deliverable) => {
      const fileNames = files
        .filter((file) => file.deliverable_id === deliverable.id)
        .map((file) => `${file.filename} ${file.file_type ?? ""} ${file.ext ?? ""}`)
        .join(" ");
      return `${deliverable.title} ${deliverable.description ?? ""} ${deliverable.status ?? ""} ${fileNames}`
        .toLowerCase()
        .includes(searchTerm);
    });
  }, [deliverables, files, searchTerm]);

  const filesByDeliverable = useMemo(() => {
    const map = new Map<string, DeliverableFile[]>();
    for (const file of files) {
      if (!file.deliverable_id) continue;
      const list = map.get(file.deliverable_id) ?? [];
      list.push(file);
      map.set(file.deliverable_id, list);
    }
    return map;
  }, [files]);

  const selectedDeliverable = useMemo(() => {
    if (!filteredDeliverables.length) return null;
    if (!selectedDeliverableId) return filteredDeliverables[0];
    return filteredDeliverables.find((item) => item.id === selectedDeliverableId) ?? filteredDeliverables[0];
  }, [filteredDeliverables, selectedDeliverableId]);

  useEffect(() => {
    if (!filteredDeliverables.length) {
      setSelectedDeliverableId(null);
      return;
    }
    if (!selectedDeliverableId || !filteredDeliverables.some((item) => item.id === selectedDeliverableId)) {
      setSelectedDeliverableId(filteredDeliverables[0].id);
    }
  }, [filteredDeliverables, selectedDeliverableId]);

  const selectedFiles = useMemo(() => {
    if (!selectedDeliverable) return [];
    return filesByDeliverable.get(selectedDeliverable.id) ?? [];
  }, [filesByDeliverable, selectedDeliverable]);

  const mediaFiles = useMemo(() => {
    return {
      videos: selectedFiles.filter((file) => {
        const mime = String(file.mime ?? "").toLowerCase();
        const ext = String(file.ext ?? "").toLowerCase();
        return mime.startsWith("video/") || ["mp4", "mov", "webm", "m4v"].includes(ext);
      }),
      images: selectedFiles.filter((file) => {
        const mime = String(file.mime ?? "").toLowerCase();
        const ext = String(file.ext ?? "").toLowerCase();
        return mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
      }),
      documents: selectedFiles.filter((file) => {
        const mime = String(file.mime ?? "").toLowerCase();
        const ext = String(file.ext ?? "").toLowerCase();
        return mime.includes("pdf") || mime.includes("document") || ["pdf", "doc", "docx", "ppt", "pptx"].includes(ext);
      }),
    };
  }, [selectedFiles]);

  const filteredMessages = useMemo(() => {
    if (!searchTerm) return messages;
    return messages.filter((message) => {
      const attachmentText = (message.attachments ?? [])
        .map((item) => `${item?.type ?? ""} ${item?.url ?? ""}`)
        .join(" ");
      return `${message.body} ${message.sender_type} ${attachmentText}`.toLowerCase().includes(searchTerm);
    });
  }, [messages, searchTerm]);

  const filteredMilestones = useMemo(() => {
    if (!searchTerm) return milestones;
    return milestones.filter((milestone) =>
      `${milestone.title} ${milestone.phase ?? ""} ${milestone.status ?? ""} ${milestone.description ?? ""}`
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [milestones, searchTerm]);

  const filteredCalendarEntries = useMemo(() => {
    if (!searchTerm) return calendarEntries;
    return calendarEntries.filter((entry) =>
      `${entry.title} ${entry.description ?? ""} ${entry.location ?? ""}`.toLowerCase().includes(searchTerm),
    );
  }, [calendarEntries, searchTerm]);

  useEffect(() => {
    if (activeTab === "inbox" && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [activeTab, filteredMessages.length, messages.length]);

  useEffect(() => {
    const qFromUrl = searchParams.get("q") ?? "";
    if (qFromUrl !== searchInput) {
      setSearchInput(qFromUrl);
    }
  }, [searchInput, searchParams]);

  const goToPortalHome = useCallback(() => {
    router.push(`/portal${impersonationToken ? `?impersonate=${encodeURIComponent(impersonationToken)}` : ""}`);
  }, [impersonationToken, router]);

  const openReview = (deliverableId: string) => {
    router.push(`/portal/review/${deliverableId}${impersonationToken ? `?impersonate=${encodeURIComponent(impersonationToken)}` : ""}`);
  };

  const sendMessage = useCallback(async () => {
    if (readOnlyMode) return;
    const body = messageInput.trim();
    const link = messageLink.trim();
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
        body: JSON.stringify({
          conversationId: convId,
          body: link ? `${body}\n\n🔗 ${link}` : body,
          attachments: link ? [{ type: "link", url: link }] : [],
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: InboxMessage };
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao enviar mensagem.");
      }

      setMessageInput("");
      setMessageLink("");
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
  }, [conversationId, id, load, messageInput, messageLink, readOnlyMode, sendingMessage]);

  const saveBrandKit = useCallback(async () => {
    if (readOnlyMode || savingBrandKit) return;
    setSavingBrandKit(true);
    setBrandKitMessage(null);
    try {
      const response = await fetch("/api/portal/brand-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          title: brandKit.title,
          logos: brandKit.logos.filter(Boolean),
          guidelines: brandKit.guidelines,
          applyPortalAccent: brandKit.applyPortalAccent,
          colors: brandKit.colors,
          fonts: brandKit.fonts,
          assets: brandKit.assets,
          summary: "Atualização via portal do cliente",
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        accentLight?: string;
        accentDark?: string;
        autoAdjusted?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao guardar brand kit.");
      }

      setBrandKit((prev) => ({
        ...prev,
        accentLight: payload.accentLight ?? prev.accentLight,
        accentDark: payload.accentDark ?? prev.accentDark,
        autoAdjusted: Boolean(payload.autoAdjusted ?? prev.autoAdjusted),
      }));

      setBrandKitMessage(payload.autoAdjusted ? "Guardado. Ajustámos a cor para contraste." : "Brand Kit guardado.");
      await load();
    } catch (saveErr) {
      setBrandKitMessage(saveErr instanceof Error ? saveErr.message : "Erro ao guardar brand kit.");
    } finally {
      setSavingBrandKit(false);
    }
  }, [brandKit, id, load, readOnlyMode, savingBrandKit]);

  const portalAccentStyle = brandKit.applyPortalAccent
    ? ({
        ["--accent-primary" as string]: brandKit.accentLight,
        ["--accent" as string]: brandKit.accentLight,
      })
    : undefined;

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
    <div className="space-y-5" style={portalAccentStyle}>
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
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

        <div className="mt-4 relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
          <input
            className="input w-full pl-9"
            placeholder="Pesquisar neste projeto (entregas, mensagens, milestones...)"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <motion.button
              key={tab.id}
              className={tabClass(activeTab === tab.id)}
              onClick={() => setTab(tab.id)}
              {...buttonMotionProps({ enabled: motionEnabled })}
            >
              {tab.label}
            </motion.button>
          ))}
        </div>
      </section>

      {activeTab === "overview" && (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="card p-4 lg:col-span-2">
            <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Timeline simples</p>
            <div className="mt-3 space-y-2">
              {filteredMilestones.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem marcos definidos.</p>
              ) : filteredMilestones.map((milestone) => (
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
              <button className="btn btn-secondary btn-sm w-full justify-start" onClick={() => setTab("deliveries")}>Abrir entregas</button>
              <button className="btn btn-secondary btn-sm w-full justify-start" onClick={() => setTab("approvals")}>Abrir aprovações</button>
              <button className="btn btn-secondary btn-sm w-full justify-start" onClick={() => setTab("inbox")}>Abrir inbox</button>
            </div>
          </article>
        </section>
      )}

      {activeTab === "deliveries" && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
          <article className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Entregas</p>
              <Package className="h-4 w-4" style={{ color: "var(--text-3)" }} />
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
              Lista de versões e ficheiros publicados.
            </p>

            <div className="mt-3 space-y-2">
              {filteredDeliverables.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>
                  Sem entregas para este filtro.
                </p>
              ) : (
                filteredDeliverables.map((item) => {
                  const isSelected = selectedDeliverable?.id === item.id;
                  const itemFiles = filesByDeliverable.get(item.id) ?? [];
                  const isNew = Date.now() - new Date(item.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
                  return (
                    <motion.button
                      key={item.id}
                      className="w-full rounded-2xl border px-3 py-3 text-left"
                      style={{
                        borderColor: isSelected ? "var(--accent-primary)" : "var(--border)",
                        background: isSelected ? "var(--accent-dim)" : "var(--surface-2)",
                      }}
                      onClick={() => setSelectedDeliverableId(item.id)}
                      variants={variants.itemEnter}
                      {...buttonMotionProps({ enabled: motionEnabled, hoverY: -1 })}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{item.title}</p>
                          <p className="text-xs" style={{ color: "var(--text-3)" }}>
                            {item.status ?? "review"} · {formatDate(item.created_at)}
                          </p>
                          <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
                            {itemFiles.length} ficheiro(s)
                          </p>
                        </div>
                        {isNew ? <span className="badge badge-success">NEW</span> : null}
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </article>

          <article className="card p-4">
            {!selectedDeliverable ? (
              <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-2)" }}>
                Seleciona uma entrega para ver preview e detalhes.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Detalhes da entrega</p>
                    <h3 className="mt-1 text-lg font-semibold" style={{ color: "var(--text)" }}>{selectedDeliverable.title}</h3>
                    <p className="text-xs" style={{ color: "var(--text-3)" }}>
                      {selectedDeliverable.status ?? "review"} · {formatDate(selectedDeliverable.created_at, true)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-secondary btn-sm" onClick={() => openReview(selectedDeliverable.id)}>
                      Abrir Aprovações
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setTab("inbox");
                        setMessageInput(`Pedido de alteração: ${selectedDeliverable.title}\n`);
                      }}
                    >
                      Enviar mensagem
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTab("approvals")}>
                      Pedir alteração
                    </button>
                  </div>
                </div>

                {selectedDeliverable.description ? (
                  <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>{selectedDeliverable.description}</p>
                ) : null}

                <div className="mt-4 space-y-3">
                  {mediaFiles.videos.length > 0 ? (
                    <div className="rounded-2xl border p-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <video
                        controls
                        className="w-full rounded-xl"
                        src={mediaFiles.videos[0].preview_url ?? mediaFiles.videos[0].shared_link ?? undefined}
                      />
                    </div>
                  ) : null}

                  {mediaFiles.images.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {mediaFiles.images.slice(0, 4).map((image) => (
                        <a
                          key={image.id}
                          href={image.preview_url ?? image.shared_link ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-2xl border p-1"
                          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.preview_url ?? image.shared_link ?? ""}
                            alt={image.filename}
                            className="h-40 w-full rounded-xl object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {mediaFiles.documents.length > 0 ? (
                    <div className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Documentos</p>
                      <div className="mt-2 space-y-2">
                        {mediaFiles.documents.map((doc) => (
                          <a
                            key={doc.id}
                            href={doc.shared_link ?? doc.preview_url ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                          >
                            <span className="truncate text-sm" style={{ color: "var(--text)" }}>{doc.filename}</span>
                            <FileText className="h-4 w-4" style={{ color: "var(--text-3)" }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedFiles.length === 0 ? (
                    <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-2)" }}>
                      Sem preview disponível. Esta entrega pode estar ligada apenas por link externo.
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedDeliverable.dropbox_url ? (
                    <a href={selectedDeliverable.dropbox_url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                      <Download className="h-4 w-4" /> Download
                    </a>
                  ) : null}
                  {selectedFiles[0]?.shared_link ? (
                    <a href={selectedFiles[0].shared_link!} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                      <Download className="h-4 w-4" /> Download ficheiro
                    </a>
                  ) : null}
                </div>
              </>
            )}
          </article>
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
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => router.push(`/portal/presentation/${id}?deliverable=${deliverable.id}${impersonationToken ? `&impersonate=${encodeURIComponent(impersonationToken)}` : ""}`)}
                  >
                    Modo apresentação
                  </button>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {activeTab === "brand_kit" && (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="card p-4 lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Brand Kit Wizard</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  Logos, cores, tipografia e guidelines com versioning.
                </p>
              </div>
              {brandKit.autoAdjusted ? <span className="badge badge-warning">Contraste ajustado</span> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span style={{ color: "var(--text-3)" }}>Título</span>
                <input
                  className="input"
                  value={brandKit.title}
                  onChange={(event) => setBrandKit((prev) => ({ ...prev, title: event.target.value }))}
                  disabled={readOnlyMode}
                />
              </label>

              <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-2)" }}>
                <input
                  type="checkbox"
                  checked={brandKit.applyPortalAccent}
                  onChange={(event) => setBrandKit((prev) => ({ ...prev, applyPortalAccent: event.target.checked }))}
                  disabled={readOnlyMode}
                />
                Aplicar cores da marca no portal (accent)
              </label>
            </div>

            <label className="space-y-1 text-xs block">
              <span style={{ color: "var(--text-3)" }}>Logos (1 URL por linha)</span>
              <textarea
                className="input min-h-[96px]"
                value={brandKit.logos.join("\n")}
                onChange={(event) => setBrandKit((prev) => ({
                  ...prev,
                  logos: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean),
                }))}
                disabled={readOnlyMode}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span style={{ color: "var(--text-3)" }}>Cor principal</span>
                <input
                  className="input"
                  value={brandKit.colors[0]?.hex ?? ""}
                  placeholder="#1A8FA3"
                  onChange={(event) => setBrandKit((prev) => {
                    const next = [...prev.colors];
                    next[0] = { name: next[0]?.name || "Primary", hex: event.target.value.trim() };
                    return { ...prev, colors: next };
                  })}
                  disabled={readOnlyMode}
                />
              </label>
              <label className="space-y-1 text-xs">
                <span style={{ color: "var(--text-3)" }}>Cor secundária</span>
                <input
                  className="input"
                  value={brandKit.colors[1]?.hex ?? ""}
                  placeholder="#63C7D7"
                  onChange={(event) => setBrandKit((prev) => {
                    const next = [...prev.colors];
                    next[1] = { name: next[1]?.name || "Secondary", hex: event.target.value.trim() };
                    return { ...prev, colors: next };
                  })}
                  disabled={readOnlyMode}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span style={{ color: "var(--text-3)" }}>Fonte Títulos</span>
                <input
                  className="input"
                  value={brandKit.fonts[0]?.name ?? ""}
                  placeholder="Ex: Sora"
                  onChange={(event) => setBrandKit((prev) => {
                    const next = [...prev.fonts];
                    next[0] = { name: event.target.value.trim(), usage: "headings" };
                    return { ...prev, fonts: next };
                  })}
                  disabled={readOnlyMode}
                />
              </label>
              <label className="space-y-1 text-xs">
                <span style={{ color: "var(--text-3)" }}>Fonte Texto</span>
                <input
                  className="input"
                  value={brandKit.fonts[1]?.name ?? ""}
                  placeholder="Ex: Inter"
                  onChange={(event) => setBrandKit((prev) => {
                    const next = [...prev.fonts];
                    next[1] = { name: event.target.value.trim(), usage: "body" };
                    return { ...prev, fonts: next };
                  })}
                  disabled={readOnlyMode}
                />
              </label>
            </div>

            <label className="space-y-1 text-xs block">
              <span style={{ color: "var(--text-3)" }}>Guidelines</span>
              <textarea
                className="input min-h-[110px]"
                value={brandKit.guidelines}
                onChange={(event) => setBrandKit((prev) => ({ ...prev, guidelines: event.target.value }))}
                disabled={readOnlyMode}
              />
            </label>

            {brandKitMessage ? (
              <p className="text-xs" style={{ color: brandKitMessage.toLowerCase().includes("erro") ? "var(--error)" : "var(--success)" }}>
                {brandKitMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm" onClick={saveBrandKit} disabled={readOnlyMode || savingBrandKit}>
                {savingBrandKit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar Brand Kit
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setBrandKit(createDefaultBrandKit())}
                disabled={readOnlyMode || savingBrandKit}
              >
                Reset
              </button>
            </div>
          </article>

          <article className="card p-4 space-y-3">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Preview light/dark</p>
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <div className="rounded-lg px-3 py-2 text-xs" style={{ background: brandKit.accentLight || "#1A8FA3", color: "#fff" }}>
                Accent light · {brandKit.accentLight || "#1A8FA3"}
              </div>
              <div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{ background: brandKit.accentDark || "#63C7D7", color: "#051014" }}>
                Accent dark · {brandKit.accentDark || "#63C7D7"}
              </div>
            </div>

            <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Versioning</p>
            <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
              {brandVersions.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem versões ainda.</p>
              ) : brandVersions.map((version) => (
                <div key={version.id} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>v{version.version_number}</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>{formatDate(version.created_at, true)}</p>
                  {version.summary ? (
                    <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>{version.summary}</p>
                  ) : null}
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
        <section className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Threads</p>
              <MessageSquare className="h-4 w-4" style={{ color: "var(--text-3)" }} />
            </div>

            <div className="mt-3 space-y-2">
              <button
                className="w-full rounded-2xl border px-3 py-3 text-left"
                style={{ borderColor: "var(--accent-primary)", background: "var(--accent-dim)" }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Conversa do projeto</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  {conversationId ? `ID ${conversationId.slice(0, 8)}...` : "Thread principal"}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
                  {filteredMessages.length} mensagem(ns) visíveis
                </p>
              </button>
            </div>
          </aside>

          <article className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Inbox</p>
              <span className="text-xs" style={{ color: "var(--text-3)" }}>Pesquisa aplicada: {searchTerm ? "sim" : "não"}</span>
            </div>

            <div className="mt-3 space-y-2">
              {filteredMessages.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem mensagens para este filtro.</p>
              ) : filteredMessages.map((message) => {
                const mine = message.sender_type === "client";
                return (
                  <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[88%] rounded-2xl px-3 py-2"
                      style={{
                        background: mine ? "var(--accent-primary)" : "var(--surface-2)",
                        color: mine ? "white" : "var(--text)",
                        border: mine ? "none" : "1px solid var(--border)",
                      }}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                      {(message.attachments ?? []).length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {(message.attachments ?? []).map((attachment, index) => (
                            <a
                              key={`${message.id}-att-${index}`}
                              href={attachment?.url ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] underline"
                              style={{ color: mine ? "rgba(255,255,255,0.88)" : "var(--accent-primary)" }}
                            >
                              {attachment?.url ?? "Anexo"}
                            </a>
                          ))}
                        </div>
                      ) : null}
                      <p className="mt-1 text-[11px]" style={{ color: mine ? "rgba(255,255,255,0.8)" : "var(--text-3)" }}>
                        {formatDate(message.created_at, true)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            <div className="mt-4 grid gap-2">
              <textarea
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder={readOnlyMode ? "Modo visualização: envio desativado" : "Escreve uma mensagem para a equipa..."}
                className="input min-h-[88px]"
                disabled={readOnlyMode || sendingMessage}
              />
              <input
                value={messageLink}
                onChange={(event) => setMessageLink(event.target.value)}
                placeholder="Link opcional (Drive, Dropbox, Loom...)"
                className="input"
                disabled={readOnlyMode || sendingMessage}
              />
              <div className="flex justify-end">
                <button className="btn btn-primary" onClick={sendMessage} disabled={readOnlyMode || sendingMessage || !messageInput.trim()}>
                  {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar
                </button>
              </div>
            </div>
          </article>
        </section>
      )}

      {activeTab === "calendar" && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <article className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Milestones e calendário</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  Timeline principal do projeto com ações rápidas de calendário.
                </p>
              </div>
              <CalendarDays className="h-4 w-4" style={{ color: "var(--text-3)" }} />
            </div>

            <div className="mt-3 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-2)" }}>
              Add to Google abre o template diretamente. Download ICS funciona para Apple/Outlook.
            </div>

            <div className="mt-3 space-y-2">
              {filteredCalendarEntries.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem eventos para este filtro.</p>
              ) : filteredCalendarEntries.map((entry) => {
                const milestone = milestones.find((item) => `m-${item.id}` === entry.id);
                return (
                  <motion.div
                    key={entry.id}
                    className="rounded-2xl border px-3 py-3"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                    variants={variants.itemEnter}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{entry.title}</p>
                        <p className="text-xs" style={{ color: "var(--text-3)" }}>
                          {formatDate(entry.startsAt, true)} · {entry.source === "shoot_day" ? "Rodagem" : (milestone?.phase ?? "Milestone")}
                        </p>
                        {milestone?.status ? (
                          <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>Estado: {milestone.status}</p>
                        ) : null}
                      </div>
                      {milestone?.status === "completed" ? <span className="badge badge-success">Concluído</span> : null}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={toGoogleCalendarUrl(entry)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                        Add to Google
                      </a>
                      <a href={buildQuickIcsUrl(entry)} className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer">
                        Download ICS
                      </a>
                      {milestone?.id ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => setTab("overview")}>
                          Confirmar
                        </button>
                      ) : null}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </article>

          <article className="card p-4">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Updates / Discussão</p>
            <div className="mt-3 space-y-2">
              {filteredMessages.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem updates para mostrar.</p>
              ) : (
                filteredMessages.slice(-6).map((message) => (
                  <div key={message.id} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
                      {message.sender_type === "client" ? "Cliente" : "Equipa"}
                    </p>
                    <p className="mt-1 text-sm line-clamp-3" style={{ color: "var(--text)" }}>{message.body}</p>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>{formatDate(message.created_at, true)}</p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Marcar call (Calendly)</p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                Agenda uma call sem sair do portal. O motivo ajuda a equipa a preparar a reunião.
              </p>
              <label className="mt-3 block text-xs">
                <span style={{ color: "var(--text-3)" }}>Motivo da call</span>
                <input
                  className="input mt-1"
                  value={callReason}
                  onChange={(event) => setCallReason(event.target.value)}
                  placeholder="Ex: validação final da V2"
                />
              </label>
              {calendlyUrl ? (
                <iframe
                  title="Calendly Embed"
                  src={`${calendlyUrl}${calendlyUrl.includes("?") ? "&" : "?"}hide_gdpr_banner=1&primary_color=${encodeURIComponent((brandKit.accentLight || "#1A8FA3").replace("#", ""))}&a1=${encodeURIComponent(callReason || "Portal Beyond")}`}
                  className="mt-3 h-[520px] w-full rounded-xl border"
                  style={{ borderColor: "var(--border)" }}
                />
              ) : (
                <p className="mt-3 text-xs" style={{ color: "var(--warning)" }}>
                  Calendly não configurado. Define `calendly_url` em `org_settings`.
                </p>
              )}
            </div>
          </article>
        </section>
      )}
    </div>
  );
}
