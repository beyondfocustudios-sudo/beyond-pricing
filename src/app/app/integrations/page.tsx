"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, Unplug } from "lucide-react";
import { MotionCard, MotionPage, Pressable } from "@/components/motion-system";

type CalendarProvider = "google" | "microsoft";

type ExternalCalendar = {
  id: string;
  label: string;
  isPrimary: boolean;
  lastSyncAt: string | null;
};

type ProviderStatus = {
  provider: CalendarProvider;
  connected: boolean;
  connectUrl: string;
  disconnectAction: string;
  syncAction: string;
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

const FALLBACK_PROVIDERS: ProviderStatus[] = [
  {
    provider: "google",
    connected: false,
    connectUrl: "/api/integrations/google/connect",
    disconnectAction: "disconnect",
    syncAction: "sync",
    status: "idle",
    lastSyncAt: null,
    lastSyncError: null,
    calendars: [],
  },
  {
    provider: "microsoft",
    connected: false,
    connectUrl: "/api/integrations/microsoft/connect",
    disconnectAction: "disconnect",
    syncAction: "sync",
    status: "idle",
    lastSyncAt: null,
    lastSyncError: null,
    calendars: [],
  },
];

function providerLabel(provider: CalendarProvider) {
  return provider === "google" ? "Google Calendar" : "Outlook Calendar (Microsoft)";
}

function statusLabel(status: ProviderStatus["status"]) {
  if (status === "running") return "Syncing";
  if (status === "success") return "Synced";
  if (status === "error") return "Erro";
  return "Idle";
}

function formatRelativeTime(value: string | null) {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca";
  return date.toLocaleString("pt-PT");
}

function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "google_oauth_config") return "Erro de configuração Google OAuth. Verifica variáveis GOOGLE_CALENDAR_*.";
  if (code === "microsoft_oauth_config") return "Erro de configuração Microsoft OAuth. Verifica variáveis MICROSOFT_CALENDAR_*.";
  if (code === "google_callback_failed") return "Callback Google falhou. Tenta novamente.";
  if (code === "microsoft_callback_failed") return "Callback Microsoft falhou. Tenta novamente.";
  return `Erro OAuth: ${code}`;
}

async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard indisponível");
  }

  const el = document.createElement("textarea");
  el.value = value;
  el.style.position = "fixed";
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  el.focus();
  el.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(el);

  if (!copied) throw new Error("Falha ao copiar");
}

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<IntegrationsPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "ok" | "error">("idle");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errCode = params.get("error");
    const connectedProvider = params.get("connected");
    if (errCode) setError(oauthErrorMessage(errCode));
    if (connectedProvider) {
      setError(null);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/integrations/calendars", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { error?: string } & Partial<IntegrationsPayload>;

    if (!res.ok) {
      setError((previous) => previous ?? json.error ?? "Falha ao carregar integrações.");
      setPayload((previous) => previous ?? {
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

    const providerMap = new Map((json.providers ?? []).map((provider) => [provider.provider, provider]));
    const providers = FALLBACK_PROVIDERS.map((fallback) => providerMap.get(fallback.provider) ?? fallback);

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

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback(
    async (action: "sync" | "disconnect" | "set_primary", opts?: { provider?: CalendarProvider; calendarId?: string }) => {
      setBusy(`${action}-${opts?.provider ?? "all"}`);
      setError(null);

      const res = await fetch("/api/integrations/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          provider: opts?.provider,
          calendarId: opts?.calendarId,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setBusy(null);
        setError(json.error ?? "Falha ao executar ação.");
        return;
      }

      await load();
      setBusy(null);
    },
    [load],
  );

  const generateFeed = useCallback(async () => {
    setBusy("ics-generate");
    setError(null);
    const res = await fetch("/api/calendar/feed-token", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setBusy(null);
      setError(json.error ?? "Falha ao gerar link ICS.");
      return;
    }
    await load();
    setBusy(null);
  }, [load]);

  const copyFeed = useCallback(async () => {
    if (!payload?.ics.feedUrl) return;
    try {
      await copyText(payload.ics.feedUrl);
      setCopied("ok");
      setTimeout(() => setCopied("idle"), 1600);
    } catch {
      setCopied("error");
      setTimeout(() => setCopied("idle"), 1800);
    }
  }, [payload?.ics.feedUrl]);

  const openFeed = useCallback(() => {
    if (!payload?.ics.feedUrl) return;
    window.open(payload.ics.feedUrl, "_blank", "noopener,noreferrer");
  }, [payload?.ics.feedUrl]);

  const providers = useMemo(() => payload?.providers ?? [], [payload]);

  return (
    <MotionPage className="space-y-5 pb-8">
      <MotionCard className="card rounded-[24px] p-5">
        <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>
          Integrações
        </p>
        <h1 className="mt-1 text-2xl font-semibold" style={{ color: "var(--text)" }}>
          Calendários
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
          Google e Outlook com sync. Apple Calendar via feed ICS.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pressable className="btn btn-secondary btn-sm" onClick={() => void mutate("sync")} disabled={busy === "sync-all" || loading}>
            {busy === "sync-all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => {
            const busyKey = busy && busy.endsWith(provider.provider);
            const statusText = provider.connected
              ? `${statusLabel(provider.status)} · Last sync ${formatRelativeTime(provider.lastSyncAt)}`
              : "Disconnected";

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
                    {provider.connected ? "Connected" : "Disconnected"}
                  </span>
                </div>

                {provider.lastSyncError ? (
                  <p className="mt-2 text-xs" style={{ color: "var(--error)" }}>
                    {provider.lastSyncError}
                  </p>
                ) : null}

                {provider.connected ? (
                  <div className="mt-4 space-y-2">
                    <label className="label">Calendário principal para push</label>
                    <select
                      className="input h-9"
                      value={provider.calendars.find((calendar) => calendar.isPrimary)?.id ?? ""}
                      onChange={(event) => {
                        void mutate("set_primary", {
                          provider: provider.provider,
                          calendarId: event.target.value,
                        });
                      }}
                      disabled={Boolean(busyKey) || provider.calendars.length === 0}
                    >
                      {provider.calendars.length === 0 ? <option value="">Sem calendários disponíveis</option> : null}
                      {provider.calendars.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>
                          {calendar.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="mt-4 text-xs" style={{ color: "var(--text-3)" }}>
                    Liga a conta para sincronização bidirecional.
                  </p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {provider.connected ? (
                    <>
                      <Pressable className="btn btn-secondary btn-sm" onClick={() => void mutate("sync", { provider: provider.provider })} disabled={Boolean(busyKey)}>
                        {busyKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Sync now
                      </Pressable>
                      <Pressable className="btn btn-secondary btn-sm" onClick={() => void mutate("disconnect", { provider: provider.provider })} disabled={Boolean(busyKey)}>
                        <Unplug className="h-3.5 w-3.5" />
                        Disconnect
                      </Pressable>
                    </>
                  ) : (
                    <a className="btn btn-secondary btn-sm col-span-2" href={provider.connectUrl}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      Connect
                    </a>
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
                  Subscrição read-only para Apple Calendar e Outlook.
                </p>
              </div>
              <span
                className="pill text-xs"
                style={{
                  background: payload?.ics.hasToken ? "var(--success-bg)" : "var(--surface-2)",
                  color: payload?.ics.hasToken ? "var(--success)" : "var(--text-2)",
                }}
              >
                {payload?.ics.hasToken ? "Connected" : "Disconnected"}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              <label className="label">Feed URL</label>
              <div className="input h-auto min-h-9 break-all py-2 text-xs" style={{ lineHeight: 1.35 }}>
                {payload?.ics.feedUrl ?? "Sem token. Clica em Gerar link ICS."}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {!payload?.ics.hasToken ? (
                <Pressable className="btn btn-secondary btn-sm col-span-2" onClick={() => void generateFeed()} disabled={busy === "ics-generate"}>
                  {busy === "ics-generate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Gerar link ICS
                </Pressable>
              ) : (
                <>
                  <Pressable className="btn btn-secondary btn-sm" onClick={() => void copyFeed()} disabled={!payload?.ics.feedUrl}>
                    <Copy className="h-3.5 w-3.5" />
                    {copied === "ok" ? "Copiado" : copied === "error" ? "Falha" : "Copiar link"}
                  </Pressable>
                  <Pressable className="btn btn-secondary btn-sm" onClick={openFeed} disabled={!payload?.ics.feedUrl}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir link
                  </Pressable>
                  <a className="btn btn-secondary btn-sm col-span-2" href={payload?.ics.downloadUrl ?? "/api/calendar/feed.ics"}>
                    Download ICS
                  </a>
                </>
              )}
            </div>

            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
              Apple Calendar: File → New Calendar Subscription… e cola o link.
              Google Calendar: Settings → Import & export para importar o ficheiro .ics.
            </p>
          </MotionCard>
        </div>
      )}
    </MotionPage>
  );
}
