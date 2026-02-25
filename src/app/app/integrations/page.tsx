"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Link2, RefreshCw } from "lucide-react";
import { MotionCard, MotionPage, Pressable } from "@/components/motion-system";

type IntegrationRow = {
  id: string | null;
  provider: string;
  status: "not_connected" | "connected" | "error";
  connectedAt: string | null;
  lastError: string | null;
};

function providerLabel(provider: string) {
  switch (provider) {
    case "notion": return "Notion";
    case "whatsapp": return "WhatsApp";
    case "youtube": return "YouTube";
    case "vimeo": return "Vimeo";
    case "dropbox": return "Dropbox";
    case "calendars": return "Calendars";
    case "slack": return "Slack";
    case "outlook": return "Outlook";
    default: return provider;
  }
}

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/integrations", { cache: "no-store" });
    const payload = await res.json().catch(() => ({} as { error?: string; integrations?: IntegrationRow[] }));
    if (!res.ok) {
      setError(payload.error ?? "Falha ao carregar integrações.");
      setLoading(false);
      return;
    }
    setIntegrations(payload.integrations ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const mutate = async (provider: string, action: "connect" | "disconnect" | "config") => {
    setSavingProvider(provider);
    setError(null);
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, action, config: { source: "integration_hub_v1" } }),
    });
    const payload = await res.json().catch(() => ({} as { error?: string }));
    if (!res.ok) {
      setError(payload.error ?? "Falha ao atualizar integração.");
      setSavingProvider(null);
      return;
    }
    await load();
    setSavingProvider(null);
  };

  return (
    <MotionPage className="space-y-5">
      <MotionCard className="card rounded-[24px] p-5">
        <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>
          Integration Hub v1
        </p>
        <h1 className="mt-1 text-2xl font-semibold" style={{ color: "var(--text)" }}>
          Conectores da operação
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
          Estrutura pronta para Notion, WhatsApp, vídeo, cloud e calendário. Nesta fase os botões são stubs seguros.
        </p>
      </MotionCard>

      {error ? (
        <MotionCard className="alert alert-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </MotionCard>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="skeleton-card h-44 rounded-[20px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {integrations.map((integration) => {
            const connected = integration.status === "connected";
            const busy = savingProvider === integration.provider;
            return (
              <MotionCard key={integration.provider} className="card rounded-[20px] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold" style={{ color: "var(--text)" }}>
                      {providerLabel(integration.provider)}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                      {connected
                        ? `Connected ${integration.connectedAt ? new Date(integration.connectedAt).toLocaleString("pt-PT") : ""}`
                        : integration.status === "error"
                          ? "Erro de ligação"
                          : "Not connected"}
                    </p>
                  </div>
                  <span
                    className="pill text-xs"
                    style={{
                      background: connected ? "var(--success-bg)" : "var(--surface-2)",
                      color: connected ? "var(--success)" : "var(--text-2)",
                    }}
                  >
                    {connected ? "Connected" : "Not connected"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Pressable className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void mutate(integration.provider, "connect")}>
                    {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Connect
                  </Pressable>
                  <Pressable className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void mutate(integration.provider, "disconnect")}>
                    Disconnect
                  </Pressable>
                  <Pressable className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void mutate(integration.provider, "config")}>
                    Config
                  </Pressable>
                </div>
              </MotionCard>
            );
          })}
        </div>
      )}
    </MotionPage>
  );
}
