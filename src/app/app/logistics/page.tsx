"use client";

import { useState, useEffect, useCallback } from "react";
import { Truck, ArrowRight, Clock, Map } from "lucide-react";

type VehicleType = "Carro" | "Carrinha" | "Caminhão";

interface RouteResult {
  distance_km: number;
  duration_min: number;
  origin: string;
  destination: string;
  vehicle: VehicleType;
  notes?: string;
  created_at?: string;
  api_unavailable?: boolean;
}

interface RouteHistory {
  id: string;
  origin: string;
  destination: string;
  distance_km: number;
  duration_min: number;
  vehicle: VehicleType;
  notes?: string;
  created_at: string;
}

export default function LogisticsPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [vehicle, setVehicle] = useState<VehicleType>("Carro");
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<RouteHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/logistics");
      if (res.ok) {
        const data = await res.json() as { routes: RouteHistory[] };
        setHistory(data.routes ?? []);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleSubmit = async () => {
    if (!origin.trim() || !destination.trim()) return;
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/logistics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination, vehicle, notes, project_id: projectId || undefined }),
      });
      const data = await res.json() as RouteResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erro ao calcular rota");
      } else {
        setResult(data);
        await fetchHistory();
      }
    } catch {
      setError("Erro de ligação");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDuration = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Truck className="h-6 w-6" style={{ color: "var(--accent)" }} />
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Logística</h1>
          <p className="text-sm" style={{ color: "var(--text-3)" }}>Planeador de rotas</p>
        </div>
      </div>

      <div className="card-glass rounded-xl p-5 space-y-4">
        <p className="font-semibold" style={{ color: "var(--text)" }}>Nova rota</p>
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Origem</label>
            <input className="input w-full" placeholder="Ex: Lisboa, Marquês de Pombal" value={origin} onChange={(e) => setOrigin(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Destino</label>
            <input className="input w-full" placeholder="Ex: Porto, Av. dos Aliados" value={destination} onChange={(e) => setDestination(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Veículo</label>
              <select className="input w-full" value={vehicle} onChange={(e) => setVehicle(e.target.value as VehicleType)}>
                <option>Carro</option>
                <option>Carrinha</option>
                <option>Caminhão</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Projeto</label>
              <select className="input w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Sem projeto</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Notas</label>
            <input className="input w-full" placeholder="Notas opcionais..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <button
          className="btn btn-primary w-full"
          onClick={handleSubmit}
          disabled={submitting || !origin.trim() || !destination.trim()}
        >
          {submitting ? "A calcular…" : "Calcular rota"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {result && (
        <div className="card-glass rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Map className="h-5 w-5" style={{ color: "var(--accent)" }} />
            <p className="font-semibold" style={{ color: "var(--text)" }}>Resultado</p>
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
            <span className="font-medium" style={{ color: "var(--text)" }}>{result.origin}</span>
            <ArrowRight className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
            <span className="font-medium" style={{ color: "var(--text)" }}>{result.destination}</span>
          </div>
          {result.api_unavailable ? (
            <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b" }}>
              Estimativa não disponível - API não configurada
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--surface-2)" }}>
                <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{result.distance_km.toFixed(1)}</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>km</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--surface-2)" }}>
                <div className="flex items-center justify-center gap-1">
                  <Clock className="h-4 w-4" style={{ color: "var(--accent)" }} />
                  <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{formatDuration(result.duration_min)}</p>
                </div>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>tempo estimado</p>
              </div>
            </div>
          )}
          <p className="text-xs" style={{ color: "var(--text-3)" }}>Veículo: {result.vehicle}</p>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>Histórico</p>
        {loadingHistory ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="card-glass rounded-xl h-16 animate-pulse" style={{ background: "var(--surface)" }} />)}
          </div>
        ) : history.length === 0 ? (
          <div className="card-glass rounded-xl p-6 text-center">
            <p className="text-sm" style={{ color: "var(--text-3)" }}>Sem rotas calculadas ainda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 10).map((r) => (
              <div key={r.id} className="card-glass rounded-xl p-3 flex items-center gap-3">
                <Truck className="h-4 w-4 shrink-0" style={{ color: "var(--text-3)" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-sm" style={{ color: "var(--text)" }}>
                    <span className="truncate">{r.origin}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} />
                    <span className="truncate">{r.destination}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>{r.distance_km.toFixed(1)} km</span>
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>{formatDuration(r.duration_min)}</span>
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>{r.vehicle}</span>
                  </div>
                </div>
                <span className="text-xs shrink-0" style={{ color: "var(--text-3)" }}>
                  {new Date(r.created_at).toLocaleDateString("pt-PT")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
