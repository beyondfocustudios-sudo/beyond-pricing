"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { EmptyState, PillButton, SkeletonCard } from "@/components/ui-kit";
import { useToast } from "@/components/Toast";

type TicketRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  route: string | null;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
};

type TicketLog = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const statusOptions: TicketRow["status"][] = ["open", "in_progress", "resolved", "closed"];

export default function SupportPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<TicketLog[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [updating, setUpdating] = useState(false);

  const selected = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [tickets, selectedId],
  );

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/support/tickets?limit=100", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        tickets?: TicketRow[];
        canManageAll?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setError(json.error ?? "Não foi possível carregar tickets.");
        setLoading(false);
        return;
      }

      const rows = json.tickets ?? [];
      setTickets(rows);
      setCanManage(Boolean(json.canManageAll));
      setSelectedId((current) => current ?? rows[0]?.id ?? null);
    } catch {
      setError("Sem ligação — não foi possível carregar tickets.");
    }

    setLoading(false);
  }, []);

  const loadTicketDetail = useCallback(async (ticketId: string) => {
    const res = await fetch(`/api/support/tickets/${ticketId}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      ticket?: TicketRow;
      logs?: TicketLog[];
      canManage?: boolean;
      error?: string;
    };

    if (!res.ok) {
      toast.error(json.error ?? "Falha ao carregar detalhe");
      return;
    }

    setLogs(json.logs ?? []);
    setCanManage(Boolean(json.canManage));
  }, [toast]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!selectedId) {
      setLogs([]);
      return;
    }
    void loadTicketDetail(selectedId);
  }, [selectedId, loadTicketDetail]);

  async function updateStatus(nextStatus: TicketRow["status"]) {
    if (!selectedId || !canManage || updating) return;

    setUpdating(true);
    const res = await fetch(`/api/support/tickets/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ticket?: TicketRow;
      error?: string;
    };

    if (!res.ok || !json.ticket) {
      toast.error(json.error ?? "Falha ao atualizar ticket");
      setUpdating(false);
      return;
    }

    setTickets((prev) => prev.map((ticket) => (ticket.id === json.ticket?.id ? { ...ticket, ...json.ticket } : ticket)));
    toast.success("Ticket atualizado");
    setUpdating(false);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="page-title">Support</h1>
          <p className="page-subtitle">Tickets e logs de bugs</p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <SkeletonCard className="h-[420px]" />
          <SkeletonCard className="h-[420px]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <EmptyState
          title="Falha ao carregar support"
          description={error}
          action={<PillButton onClick={loadTickets}>Retry</PillButton>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Support</h1>
          <p className="page-subtitle">Tickets abertos, severidade e diagnóstico técnico</p>
        </div>
        <PillButton onClick={loadTickets} className="inline-flex items-center gap-1.5">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </PillButton>
      </div>

      {tickets.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Sem tickets"
            description="Quando houver reportes do HQ Assistant, aparecem aqui automaticamente."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="card max-h-[75vh] overflow-y-auto p-3">
            <div className="space-y-2">
              {tickets.map((ticket) => {
                const active = selectedId === ticket.id;
                return (
                  <button
                    key={ticket.id}
                    onClick={() => setSelectedId(ticket.id)}
                    className="w-full rounded-2xl border p-3 text-left transition"
                    style={{
                      borderColor: active ? "rgba(26, 143, 163, 0.45)" : "var(--border)",
                      background: active ? "rgba(26, 143, 163, 0.1)" : "var(--surface-2)",
                    }}
                  >
                    <p className="line-clamp-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {ticket.title}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                      {ticket.severity} · {ticket.status}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                      {new Date(ticket.created_at).toLocaleString("pt-PT")}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="card min-h-[420px]">
            {!selected ? (
              <EmptyState title="Seleciona um ticket" description="Escolhe um item na lista para ver os detalhes." />
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>{selected.title}</h2>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>
                      {selected.route || "Rota desconhecida"} · {new Date(selected.created_at).toLocaleString("pt-PT")}
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={{ borderColor: "var(--border-soft)", color: "var(--text-2)" }}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {selected.severity}
                  </div>
                </div>

                <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-2)" }}>
                  {selected.description || "Sem descrição detalhada"}
                </p>

                <div className="rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
                    Estado
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {statusOptions.map((status) => (
                      <PillButton
                        key={status}
                        onClick={() => void updateStatus(status)}
                        disabled={!canManage || updating}
                        className="px-3 py-1.5 text-xs"
                        variant={selected.status === status ? "primary" : "secondary"}
                      >
                        {updating && selected.status === status ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {status}
                      </PillButton>
                    ))}
                  </div>
                  {!canManage ? (
                    <p className="mt-2 text-xs" style={{ color: "var(--text-3)" }}>
                      Apenas owner/admin podem alterar estado.
                    </p>
                  ) : null}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
                    Logs ({logs.length})
                  </p>
                  {logs.length === 0 ? (
                    <div className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                      Sem logs adicionais.
                    </div>
                  ) : (
                    <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                      {logs.map((log) => (
                        <article key={log.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{log.type}</span>
                            <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                              {new Date(log.created_at).toLocaleTimeString("pt-PT")}
                            </span>
                          </div>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px]" style={{ color: "var(--text-2)" }}>
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                {selected.status === "resolved" || selected.status === "closed" ? (
                  <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs" style={{ borderColor: "rgba(34, 197, 94, 0.35)", color: "#22c55e" }}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Ticket resolvido
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
