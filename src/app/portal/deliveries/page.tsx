"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Eye, Film, FileText, Image as ImageIcon, MessageSquare, Search, TriangleAlert } from "lucide-react";
import { getClientProjects, getProjectDeliverables, type PortalDeliverable, type PortalProject } from "@/lib/portal-data";

export default function PortalDeliveriesPage() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<PortalDeliverable & { projectName: string }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const projects = await getClientProjects();
        const deliveries = await Promise.all(
          projects.map(async (project: PortalProject) => {
            const list = await getProjectDeliverables(project.id);
            return list.map((delivery) => ({ ...delivery, projectName: project.name }));
          }),
        );

        if (cancelled) return;
        const merged = deliveries.flat().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setItems(merged);
        setSelectedId(merged[0]?.id ?? null);
      } catch {
        if (!cancelled) setError("Falha ao carregar entregas.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!query) return items;
    return items.filter((item) => `${item.title} ${item.projectName} ${item.file_type ?? ""}`.toLowerCase().includes(query));
  }, [items, query]);

  const selected = useMemo(() => filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null, [filtered, selectedId]);

  const openLink = async (item: PortalDeliverable, mode: "preview" | "download") => {
    if (item.is_demo && item.dropbox_url) {
      window.open(item.dropbox_url, "_blank", "noopener,noreferrer");
      return;
    }

    const fileId = item.file_id ?? item.id;
    setLinkLoading(`${fileId}:${mode}`);
    try {
      const res = await fetch("/api/portal/deliverables/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, mode }),
      });
      const json = await res.json().catch(() => ({} as { error?: string; url?: string }));
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Não foi possível abrir o ficheiro.");
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o ficheiro.");
    } finally {
      setLinkLoading(null);
    }
  };

  if (loading) return <div className="skeleton h-[72vh] rounded-3xl" />;

  if (error) {
    return (
      <div className="card p-6">
        <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
        <button className="btn btn-secondary mt-3" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[340px_minmax(0,1fr)_320px]">
      <section className="card min-h-[65vh] p-4 lg:h-[calc(100dvh-180px)] lg:overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Entregas</h1>
          <span className="pill text-[11px]">{filtered.length}</span>
        </div>
        <label className="table-search-pill mb-3">
          <Search className="h-3.5 w-3.5" />
          <input readOnly value={query} placeholder="Usa a pesquisa no topo" />
        </label>

        <div className="space-y-2">
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className="card card-hover w-full p-3 text-left"
              style={{
                borderColor: selected?.id === item.id ? "rgba(26,143,163,0.35)" : "var(--border)",
                background: selected?.id === item.id ? "rgba(26,143,163,0.08)" : "var(--surface)",
              }}
            >
              <p className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>{item.projectName} • {new Date(item.created_at).toLocaleDateString("pt-PT")}</p>
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
              Sem entregas para o filtro atual.
            </p>
          ) : null}
        </div>
      </section>

      <section className="card min-w-0 min-h-[65vh] p-5 lg:h-[calc(100dvh-180px)] lg:overflow-y-auto">
        {selected ? (
          <>
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.1em]" style={{ color: "var(--text-3)" }}>Preview</p>
              <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>{selected.title}</h2>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>{selected.projectName}</p>
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
              {(selected.file_type ?? "").includes("video") ? (
                <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}><Film className="h-4 w-4" /> Vídeo pronto para review</p>
              ) : (selected.file_type ?? "").includes("image") ? (
                <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}><ImageIcon className="h-4 w-4" /> Imagem disponível</p>
              ) : (
                <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}><FileText className="h-4 w-4" /> Documento disponível</p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => void openLink(selected, "preview")}
                disabled={linkLoading === `${selected.file_id ?? selected.id}:preview`}
              >
                <Eye className="h-4 w-4" /> Abrir preview
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => void openLink(selected, "download")}
                disabled={linkLoading === `${selected.file_id ?? selected.id}:download`}
              >
                <Download className="h-4 w-4" /> Download
              </button>
              <Link className="btn btn-secondary btn-sm" href={`/portal/projects/${selected.project_id}?tab=approvals`}>
                <TriangleAlert className="h-4 w-4" /> Pedir alteração
              </Link>
              <Link className="btn btn-ghost btn-sm" href={`/portal/projects/${selected.project_id}?tab=inbox`}>
                <MessageSquare className="h-4 w-4" /> Mensagem
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>Seleciona uma entrega.</p>
        )}
      </section>

      <aside className="card min-h-[65vh] p-5 lg:h-[calc(100dvh-180px)] lg:overflow-y-auto">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Detalhes da entrega</h3>
        {selected ? (
          <div className="mt-3 space-y-2 text-xs" style={{ color: "var(--text-2)" }}>
            <p><strong style={{ color: "var(--text)" }}>Status:</strong> {selected.status ?? "novo"}</p>
            <p><strong style={{ color: "var(--text)" }}>Tipo:</strong> {selected.file_type ?? "ficheiro"}</p>
            <p><strong style={{ color: "var(--text)" }}>Data:</strong> {new Date(selected.created_at).toLocaleString("pt-PT")}</p>
          </div>
        ) : (
          <p className="mt-3 text-xs" style={{ color: "var(--text-3)" }}>Sem seleção.</p>
        )}
      </aside>
    </div>
  );
}
