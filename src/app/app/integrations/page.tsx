"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, Unplug } from "lucide-react";
import { MotionCard, MotionPage, Pressable } from "@/components/motion-system";
import { useToast } from "@/components/Toast";

type ExternalCalendar = {
  id: string;
  label: string;
  isPrimary: boolean;
  lastSyncAt: string | null;
};

type ProviderStatus = {
  provider: "google" | "microsoft";
  connected: boolean;
  configReady: boolean;
  missingEnv: string[];
  connectUrl: string;
  status: "idle" | "running" | "success" | "error" | string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  calendars: ExternalCalendar[];
};

type IntegrationsPayload = {
  providers: ProviderStatus[];
  ics: {
    hasToken: boolean;
    feedToken: string;
    feedUrl: string | null;
    downloadUrl: string;
  };
};

type DropboxStatusPayload = {
  connected: boolean;
  connectUrl: string;
  rootPath?: string | null;
  rootConfigured?: boolean;
  config: {
    ready: boolean;
    missing: string[];
  };
  connection: {
    id: string;
    accountEmail: string | null;
    accountId: string | null;
    updatedAt: string | null;
    expiresAt: string | null;
    lastSyncedAt: string | null;
  } | null;
};

function formatRelativeTime(value: string | null) {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca";
  return date.toLocaleString("pt-PT");
}

function statusLabel(status: ProviderStatus["status"]) {
  if (status === "running") return "Syncing";
  if (status === "success") return "Synced";
  if (status === "error") return "Erro";
  return "Idle";
}

type CalendarProvider = ProviderStatus["provider"];

const FALLBACK_PROVIDERS: ProviderStatus[] = [
  {
    provider: "google",
    connected: false,
    configReady: true,
    missingEnv: [],
    connectUrl: "/api/integrations/google/connect",
    status: "idle",
    lastSyncAt: null,
    lastSyncError: null,
    calendars: [],
  },
  {
    provider: "microsoft",
    connected: false,
    configReady: true,
    missingEnv: [],
    connectUrl: "/api/integrations/microsoft/connect",
    status: "idle",
    lastSyncAt: null,
    lastSyncError: null,
    calendars: [],
  },
];

function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "google_oauth_config") return "Erro de configuração Google OAuth. Verifica variaveis GOOGLE_CALENDAR_*.";
  if (code === "microsoft_oauth_config") return "Erro de configuração Microsoft OAuth. Verifica variaveis MICROSOFT_CALENDAR_*.";
  if (code === "google_callback_failed") return "Callback Google falhou — código inválido ou state mismatch. Tenta de novo.";
  if (code === "microsoft_callback_failed") return "Callback Microsoft falhou — código inválido ou state mismatch. Tenta de novo.";
  return `Erro OAuth: ${code}`;
}

function providerLabel(provider: CalendarProvider) {
  return provider === "google" ? "Google Calendar" : "Outlook Calendar (Microsoft)";
}

function providerConfigMissingMessage(missingEnv: string[]) {
  if (missingEnv.length === 0) return null;
  return `Configuracao em falta: ${missingEnv.join(", ")}`;
}

function actionBusyKey(action: string, provider?: CalendarProvider | "all") {
  return `${action}:${provider ?? "all"}`;
}

export default function IntegrationsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<IntegrationsPayload | null>(null);
  const [dropbox, setDropbox] = useState<DropboxStatusPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dropboxRootPath, setDropboxRootPath] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errCode = params.get("error");
    const connectedProvider = params.get("connected") as CalendarProvider | null;
    if (errCode) setError(oauthErrorMessage(errCode));
    if (connectedProvider) {
      setError(null);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError((previous) => previous);

    const res = await fetch("/api/integrations/calendars", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { error?: string } & Partial<IntegrationsPayload>;

    if (!res.ok) {
      setError((prev) => prev ?? (json.error ?? "Falha ao carregar integrações de calendário."));
      setPayload((prev) => prev ?? {
        providers: FALLBACK_PROVIDERS,
        ics: {
          hasToken: false,
          feedToken: "",
          feedUrl: null,
          downloadUrl: "/api/calendar/feed.ics",
        },
      });
      setLoading(false);
      return;
    }

    const liveByProvider = new Map((json.providers as ProviderStatus[] ?? []).map((provider) => [provider.provider, provider]));
    const providers = FALLBACK_PROVIDERS.map((fallback) => liveByProvider.get(fallback.provider) ?? fallback);

    setPayload({
      providers,
      ics: {
        hasToken: Boolean(json.ics?.hasToken),
        feedToken: json.ics?.feedToken ?? "",
        feedUrl: json.ics?.feedUrl ?? null,
        downloadUrl: json.ics?.downloadUrl ?? "/api/calendar/feed.ics",
      },
    });
    setLoading(false);
  }, []);

  const loadDropbox = useCallback(async () => {
    const response = await fetch("/api/dropbox/health", { cache: "no-store" });
    const json = (await response.json().catch(() => ({}))) as Partial<DropboxStatusPayload> & { error?: string };
    if (!response.ok) {
      setDropbox({
        connected: false,
        connectUrl: "/api/dropbox/connect",
        rootPath: null,
        rootConfigured: false,
        config: {
          ready: false,
          missing: json.error ? [json.error] : ["Não foi possível carregar estado Dropbox"],
        },
        connection: null,
      });
      return;
    }
    setDropbox({
      connected: Boolean(json.connected),
      connectUrl: json.connectUrl ?? "/api/dropbox/connect",
      rootPath: json.rootPath ?? null,
      rootConfigured: Boolean(json.rootConfigured ?? json.rootPath),
      config: {
        ready: Boolean(json.config?.ready),
        missing: json.config?.missing ?? [],
      },
      connection: json.connection ?? null,
    });
    setDropboxRootPath(json.rootPath ?? "");
  }, []);

  useEffect(() => {
    void load();
    void loadDropbox();
  }, [load, loadDropbox]);

  const runAction = useCallback(async (busyKey: string, run: () => Promise<Response>) => {
    setBusy(busyKey);
    setError(null);
    const res = await run();
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Falha ao executar ação da integração.");
      setBusy(null);
      return false;
    }

    await load();
    setBusy(null);
    return true;
  }, [load]);

  const disconnectProvider = useCallback((provider: CalendarProvider) => {
    return runAction(actionBusyKey("disconnect", provider), () =>
      fetch("/api/integrations/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", provider }),
      }),
    );
  }, [runAction]);

  const syncProvider = useCallback((provider?: CalendarProvider) => {
    return runAction(actionBusyKey("sync", provider ?? "all"), () =>
      fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provider ? { provider } : {}),
      }),
    );
  }, [runAction]);

  const setPrimaryProviderCalendar = useCallback((provider: CalendarProvider, calendarId: string) => {
    if (!calendarId) return Promise.resolve(false);
    return runAction(actionBusyKey("set-primary", provider), () =>
      fetch("/api/integrations/set-primary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, calendar_id: calendarId }),
      }),
    );
  }, [runAction]);

  const ensureIcsFeedToken = useCallback(async () => {
    await runAction(actionBusyKey("ics-generate"), () =>
      fetch("/api/calendar/feed-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      }),
    );
  }, [runAction]);

  const disconnectDropbox = useCallback(async () => {
    setBusy("dropbox:disconnect");
    setError(null);
    const response = await fetch("/api/dropbox/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Falha ao desligar Dropbox.");
      setBusy(null);
      return;
    }
    await loadDropbox();
    setBusy(null);
  }, [loadDropbox]);

  const setDropboxRoot = useCallback(async () => {
    setBusy("dropbox:set-root");
    setError(null);
    const response = await fetch("/api/dropbox/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_root", rootPath: dropboxRootPath }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; rootPath?: string };
    if (!response.ok) {
      const message = payload.error === "DROPBOX_PATH_OUTSIDE_ROOT" ? "A pasta tem de estar dentro de /Clientes" : (payload.error ?? "Falha ao atualizar root Dropbox.");
      setError(message);
      if (payload.error === "DROPBOX_PATH_OUTSIDE_ROOT") toast.error("A pasta tem de estar dentro de /Clientes");
      setBusy(null);
      return;
    }
    if (payload.rootPath) setDropboxRootPath(payload.rootPath);
    await loadDropbox();
    setBusy(null);
  }, [dropboxRootPath, loadDropbox, toast]);

  const syncDropboxRoot = useCallback(async () => {
    setBusy("dropbox:sync-root");
    setError(null);
    const response = await fetch("/api/dropbox/ensure-root", { method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; rootPath?: string };
    if (!response.ok) {
      const message = payload.error === "DROPBOX_PATH_OUTSIDE_ROOT" ? "A pasta tem de estar dentro de /Clientes" : (payload.error ?? "Falha ao sincronizar root Dropbox.");
      setError(message);
      if (payload.error === "DROPBOX_PATH_OUTSIDE_ROOT") toast.error("A pasta tem de estar dentro de /Clientes");
      setBusy(null);
      return;
    }
    if (payload.rootPath) setDropboxRootPath(payload.rootPath);
    await loadDropbox();
    setBusy(null);
  }, [loadDropbox, toast]);

  const providers = useMemo(() => payload?.providers ?? [], [payload]);

  const copyFeed = useCallback(async () => {
    if (!payload?.ics.feedUrl) return;
    try {
      await navigator.clipboard.writeText(payload.ics.feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Nao foi possivel copiar o link ICS.");
    }
  }, [payload?.ics.feedUrl]);

  const icsStatus = useMemo(() => {
    if (busy === actionBusyKey("ics-generate")) return "Loading";
    if (payload?.ics.hasToken) return "Connected";
    return "Disconnected";
  }, [busy, payload?.ics.hasToken]);

  return (
    <MotionPage className="space-y-5 pb-8">
      <MotionCard className="card rounded-[24px] p-5">
        <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>
          Integracoes
        </p>
        <h1 className="mt-1 text-2xl font-semibold" style={{ color: "var(--text)" }}>
          Integracoes
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
          Configura e sincroniza os conectores externos da plataforma.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pressable
            className="btn btn-secondary btn-sm"
            onClick={() => void syncProvider()}
            disabled={busy === actionBusyKey("sync", "all") || loading}
          >
            {busy === actionBusyKey("sync", "all") ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync now (all)
          </Pressable>
          <a className="btn btn-secondary btn-sm" href="/app/calendar">
            Abrir calendário interno
          </a>
        </div>
      </MotionCard>

      {error ? (
        <MotionCard className="alert alert-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </MotionCard>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="skeleton-card h-52 rounded-[20px]" />
          ))}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Calendarios</h2>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>Google, Outlook e Apple Calendar (via ICS).</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {providers.map((provider) => {
                const busySync = busy === actionBusyKey("sync", provider.provider);
                const busyDisconnect = busy === actionBusyKey("disconnect", provider.provider);
                const busyPrimary = busy === actionBusyKey("set-primary", provider.provider);
                const busyProvider = busySync || busyDisconnect || busyPrimary;
                const primaryCalendar = provider.calendars.find((calendar) => calendar.isPrimary)?.id ?? "";
                const configMissing = !provider.connected && !provider.configReady;
                const statusText = provider.connected
                  ? `${statusLabel(provider.status)} · Last sync ${formatRelativeTime(provider.lastSyncAt)}`
                  : configMissing ? "Configuracao em falta" : "Disconnected";

                return (
                  <MotionCard key={provider.provider} className="card rounded-[20px] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-semibold" style={{ color: "var(--text)" }}>
                          {providerLabel(provider.provider)}
                        </p>
                        <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                          {statusText}
                        </p>
                      </div>
                      <span
                        className="pill text-xs"
                        style={{
                          background: provider.connected ? "var(--success-bg)" : "var(--surface-2)",
                          color: provider.connected ? "var(--success)" : "var(--text-2)",
                        }}
                      >
                        {provider.connected ? "Connected" : configMissing ? "Configuração em falta" : "Disconnected"}
                      </span>
                    </div>

                    {provider.lastSyncError ? (
                      <p className="mt-2 text-xs" style={{ color: "var(--error)" }}>
                        {provider.lastSyncError}
                      </p>
                    ) : null}

                    {configMissing ? (
                      <p className="mt-2 text-xs" style={{ color: "var(--warning)" }}>
                        {providerConfigMissingMessage(provider.missingEnv)}
                      </p>
                    ) : null}

                    {provider.connected ? (
                      <div className="mt-4 space-y-2">
                        <label className="label">Calendario principal</label>
                        <select
                          className="input h-9"
                          value={primaryCalendar}
                          onChange={(event) => void setPrimaryProviderCalendar(provider.provider, event.target.value)}
                          disabled={busyProvider || provider.calendars.length === 0}
                        >
                          {provider.calendars.length === 0 ? (
                            <option value="">Sem calendarios disponiveis</option>
                          ) : null}
                          {provider.calendars.map((calendar) => (
                            <option key={calendar.id} value={calendar.id}>
                              {calendar.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="mt-4 text-xs" style={{ color: "var(--text-3)" }}>
                        Liga a conta para ativar sync bidirecional e incremental.
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {provider.connected ? (
                        <>
                          <Pressable
                            className="btn btn-secondary btn-sm"
                            onClick={() => void syncProvider(provider.provider)}
                            disabled={busyProvider}
                          >
                            {busySync ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Sync now
                          </Pressable>
                          <Pressable
                            className="btn btn-secondary btn-sm"
                            onClick={() => void disconnectProvider(provider.provider)}
                            disabled={busyProvider}
                          >
                            {busyDisconnect ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                            Disconnect
                          </Pressable>
                        </>
                      ) : provider.configReady ? (
                        <a className="btn btn-secondary btn-sm col-span-2" href={provider.connectUrl}>
                          <ExternalLink className="h-3.5 w-3.5" />
                          Connect
                        </a>
                      ) : (
                        <button className="btn btn-secondary btn-sm col-span-2" disabled title={providerConfigMissingMessage(provider.missingEnv) ?? undefined}>
                          <ExternalLink className="h-3.5 w-3.5" />
                          Connect
                        </button>
                      )}
                    </div>
                  </MotionCard>
                );
              })}

              <MotionCard className="card rounded-[20px] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold" style={{ color: "var(--text)" }}>
                      Apple Calendar (ICS)
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                      Feed read-only para Apple Calendar e Outlook.
                    </p>
                  </div>
                  <span
                    className="pill text-xs"
                    style={{
                      background: payload?.ics.hasToken ? "var(--success-bg)" : "var(--surface-2)",
                      color: payload?.ics.hasToken ? "var(--success)" : "var(--text-2)",
                    }}
                  >
                    {icsStatus}
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  <label className="label">Feed URL</label>
                  <div className="input h-auto min-h-9 break-all py-2 text-xs" style={{ lineHeight: 1.35 }}>
                    {payload?.ics.feedUrl ?? "Ainda sem link gerado."}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {!payload?.ics.hasToken ? (
                    <Pressable
                      className="btn btn-secondary btn-sm col-span-2"
                      onClick={() => void ensureIcsFeedToken()}
                      disabled={busy === actionBusyKey("ics-generate")}
                    >
                      {busy === actionBusyKey("ics-generate") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Gerar link ICS
                    </Pressable>
                  ) : (
                    <>
                      <Pressable className="btn btn-secondary btn-sm" onClick={() => void copyFeed()} disabled={!payload?.ics.feedUrl}>
                        <Copy className="h-3.5 w-3.5" />
                        {copied ? "Copied" : "Copy link"}
                      </Pressable>
                      <a className="btn btn-secondary btn-sm" href={payload?.ics.downloadUrl ?? "/api/calendar/feed.ics"} target="_blank" rel="noreferrer">
                        Download ICS
                      </a>
                      <a
                        className="btn btn-secondary btn-sm col-span-2"
                        href={payload?.ics.feedUrl ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(payload.ics.feedUrl)}` : "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrir no Google Calendar
                      </a>
                    </>
                  )}
                </div>

                <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
                  Apple Calendar: File - New Calendar Subscription... e cola o link ICS.
                </p>
              </MotionCard>
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Entregas</h2>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>Conectores de entregas e storage.</p>
            </div>
            <MotionCard className="card rounded-[20px] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold" style={{ color: "var(--text)" }}>
                    Dropbox
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                    Conexão global da Beyond para previews e downloads no portal.
                  </p>
                </div>
                <span
                  className="pill text-xs"
                  style={{
                    background: dropbox?.connected ? "var(--success-bg)" : "var(--surface-2)",
                    color: dropbox?.connected ? "var(--success)" : "var(--text-2)",
                  }}
                >
                  {dropbox?.connected ? "Connected" : "Disconnected"}
                </span>
              </div>

              {dropbox?.connected ? (
                <div className="mt-3 rounded-xl border p-3 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-2)" }}>
                  <p>
                    Conta: <span style={{ color: "var(--text)" }}>{dropbox.connection?.accountEmail ?? "—"}</span>
                  </p>
                  <p className="mt-1">
                    Última atualização: <span style={{ color: "var(--text)" }}>{formatRelativeTime(dropbox.connection?.updatedAt ?? null)}</span>
                  </p>
                  <p className="mt-1">
                    Root: <span style={{ color: "var(--text)" }}>{dropboxRootPath || "—"}</span>
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs" style={{ color: "var(--text-3)" }}>
                  Sem Dropbox conectado. O portal usa Demo Mode com ficheiros locais até conectares.
                </p>
              )}

              {dropbox && !dropbox.config.ready ? (
                <p className="mt-3 text-xs" style={{ color: "var(--warning)" }}>
                  Configuração em falta: {dropbox.config.missing.join(", ")}
                </p>
              ) : null}
              {dropbox?.connected && !dropbox?.rootConfigured ? (
                <p className="mt-3 text-xs" style={{ color: "var(--warning)" }}>
                  Root Dropbox não configurado. Define a pasta base antes de sincronizar.
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <input
                  className="input input-sm max-w-xs"
                  value={dropboxRootPath}
                  onChange={(event) => setDropboxRootPath(event.target.value)}
                  placeholder="/Clientes"
                  disabled={!dropbox?.connected}
                />
                <Pressable
                  className="btn btn-secondary btn-sm"
                  onClick={() => void setDropboxRoot()}
                  disabled={!dropbox?.connected || busy === "dropbox:set-root" || !dropboxRootPath.trim()}
                >
                  {busy === "dropbox:set-root" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Set root
                </Pressable>
                <Pressable
                  className="btn btn-secondary btn-sm"
                  onClick={() => void syncDropboxRoot()}
                  disabled={!dropbox?.connected || busy === "dropbox:sync-root"}
                >
                  {busy === "dropbox:sync-root" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Sync now
                </Pressable>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {dropbox?.connected ? (
                  <Pressable
                    className="btn btn-secondary btn-sm"
                    onClick={() => void disconnectDropbox()}
                    disabled={busy === "dropbox:disconnect"}
                  >
                    {busy === "dropbox:disconnect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                    Disconnect
                  </Pressable>
                ) : dropbox && !dropbox.config.ready ? (
                  <button className="btn btn-secondary btn-sm" disabled title={dropbox.config.missing.join(", ")}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Connect Dropbox
                  </button>
                ) : (
                  <a className="btn btn-secondary btn-sm" href={dropbox?.connectUrl ?? "/api/dropbox/connect"}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Connect Dropbox
                  </a>
                )}
                <Link className="btn btn-secondary btn-sm" href="/app/projects">
                  Abrir projetos
                </Link>
              </div>
            </MotionCard>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Notificacoes</h2>
              <p className="text-sm" style={{ color: "var(--text-2)" }}>Canal de alertas e webhooks.</p>
            </div>
            <MotionCard className="card rounded-[20px] p-4">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Email / Slack</p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                Placeholder para gestão centralizada de notificações.
              </p>
            </MotionCard>
          </section>
        </>
      )}
    </MotionPage>
  );
}
