"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, MapPin, Plus, Route, Save, Trash2, Truck } from "lucide-react";
import { useToast } from "./Toast";

type RouteResult = {
  km_total: number;
  duration_total_min: number;
  fuel_cost_estimate: number;
  fuel_liters: number;
  fuel_price_per_l: number;
  cost_per_km_fallback: number | null;
  tolls_estimate: number;
  source?: string;
  fuel_source?: string;
};

interface LogisticsTabProps {
  projectId: string;
  locationText?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationAddress?: string | null;
  travelKm?: number | null;
  travelMinutes?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  onUpdate: (data: {
    location_text: string | null;
    location_lat: number | null;
    location_lng: number | null;
    location_address: string | null;
    travel_km: number | null;
    travel_minutes: number | null;
  }) => Promise<void>;
}

const DEFAULT_BASE = "Setúbal, Portugal";

function parseNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function minutesToLabel(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export function ProjectLogisticsTab(props: LogisticsTabProps) {
  const toast = useToast();

  const [baseText, setBaseText] = useState(props.locationText || DEFAULT_BASE);
  const [waypoints, setWaypoints] = useState<string[]>(props.locationText ? [props.locationText] : [""]);
  const [roundtrip, setRoundtrip] = useState(true);

  const [loadingStored, setLoadingStored] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [manualKm, setManualKm] = useState(props.travelKm != null ? String(props.travelKm) : "");
  const [manualMin, setManualMin] = useState(props.travelMinutes != null ? String(props.travelMinutes) : "");
  const [manualFuelPrice, setManualFuelPrice] = useState("");
  const [manualCostKm, setManualCostKm] = useState("");
  const [manualTolls, setManualTolls] = useState("");
  const [fuelUpdatedAt, setFuelUpdatedAt] = useState<string | null>(null);
  const [fuelSourceLabel, setFuelSourceLabel] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const cleanedWaypoints = useMemo(
    () => waypoints.map((value) => value.trim()).filter((value) => value.length > 0),
    [waypoints],
  );

  useEffect(() => {
    const loadStoredRoute = async () => {
      setLoadingStored(true);
      try {
        const res = await fetch(`/api/logistics?projectId=${encodeURIComponent(props.projectId)}`, { cache: "no-store" });
        if (!res.ok) return;

        const payload = (await res.json().catch(() => ({}))) as {
          routes?: Array<Record<string, unknown>>;
        };
        const latest = payload.routes?.[0];
        if (!latest) return;

        const loadedBase = String(latest.base_text ?? latest.origin ?? props.locationText ?? DEFAULT_BASE);
        const loadedWaypoints = Array.isArray(latest.waypoints)
          ? latest.waypoints.map((value) => String(value))
          : props.locationText
            ? [props.locationText]
            : [""];

        setBaseText(loadedBase);
        setWaypoints(loadedWaypoints.length > 0 ? loadedWaypoints : [""]);
        setRoundtrip(Boolean(latest.roundtrip ?? true));

        const km = Number(latest.km_total ?? latest.distance_km ?? props.travelKm ?? NaN);
        const min = Number(latest.duration_total_min ?? latest.duration_min ?? props.travelMinutes ?? NaN);
        const fuelPrice = Number(latest.fuel_price_per_l ?? latest.fuel_price_per_liter ?? NaN);
        const fuelLiters = Number(latest.fuel_liters ?? NaN);
        const fuelCost = Number(latest.fuel_cost_estimate ?? latest.fuel_cost ?? NaN);

        if (Number.isFinite(km)) setManualKm(String(km));
        if (Number.isFinite(min)) setManualMin(String(min));
        if (Number.isFinite(fuelPrice)) setManualFuelPrice(String(fuelPrice));

        if (Number.isFinite(km) && Number.isFinite(min)) {
          setResult({
            km_total: km,
            duration_total_min: min,
            fuel_cost_estimate: Number.isFinite(fuelCost) ? fuelCost : 0,
            fuel_liters: Number.isFinite(fuelLiters) ? fuelLiters : 0,
            fuel_price_per_l: Number.isFinite(fuelPrice) ? fuelPrice : 0,
            cost_per_km_fallback: Number.isFinite(Number(latest.cost_per_km_fallback ?? NaN))
              ? Number(latest.cost_per_km_fallback)
              : null,
            tolls_estimate: Number.isFinite(Number(latest.tolls_estimate ?? NaN))
              ? Number(latest.tolls_estimate)
              : 0,
            source: String(latest.raw_response ? "stored" : "manual"),
            fuel_source: "stored",
          });
        }
      } finally {
        setLoadingStored(false);
      }
    };

    void loadStoredRoute();
  }, [props.locationText, props.projectId, props.travelKm, props.travelMinutes]);

  useEffect(() => {
    const loadFuel = async () => {
      try {
        const res = await fetch("/api/plugins/fuel?country=PT&type=diesel", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { price_per_liter?: number; updated_at?: string; source?: string };
        if (!res.ok) return;
        if ((manualFuelPrice ?? "").trim() === "" && Number.isFinite(Number(json.price_per_liter ?? NaN))) {
          setManualFuelPrice(String(json.price_per_liter));
        }
        setFuelUpdatedAt(json.updated_at ?? null);
        setFuelSourceLabel(json.source ?? null);
      } catch {
        // optional
      }
    };
    void loadFuel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateWaypoint = (index: number, value: string) => {
    setWaypoints((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const addWaypoint = () => setWaypoints((prev) => [...prev, ""]);

  const removeWaypoint = (index: number) => {
    setWaypoints((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length > 0 ? next : [""];
    });
  };

  const moveWaypoint = (index: number, direction: -1 | 1) => {
    setWaypoints((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const current = next[index];
      next[index] = next[target];
      next[target] = current;
      return next;
    });
  };

  const moveWaypointToIndex = (fromIndex: number, toIndex: number) => {
    setWaypoints((prev) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const calculateRoute = async () => {
    if (!baseText.trim() || cleanedWaypoints.length === 0 || calculating) {
      toast.error("Define base e pelo menos um destino.");
      return;
    }

    setCalculating(true);
    setRouteError(null);

    try {
      const res = await fetch("/api/logistics/route-calc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: props.projectId,
          baseText: baseText.trim(),
          waypoints: cleanedWaypoints,
          roundtrip,
          fuelPricePerL: parseNumber(manualFuelPrice) ?? undefined,
          costPerKmFallback: parseNumber(manualCostKm) ?? undefined,
          tollsEstimate: parseNumber(manualTolls) ?? undefined,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        km_total?: number;
        duration_total_min?: number;
        fuel_cost_estimate?: number;
        fuel_liters?: number;
        fuel_price_per_l?: number;
        cost_per_km_fallback?: number | null;
        tolls_estimate?: number;
        source?: string;
        fuel_source?: string;
      };

      if (!res.ok) {
        throw new Error(json.error ?? "Falha ao calcular rota");
      }

      const computed: RouteResult = {
        km_total: Number(json.km_total ?? 0),
        duration_total_min: Number(json.duration_total_min ?? 0),
        fuel_cost_estimate: Number(json.fuel_cost_estimate ?? 0),
        fuel_liters: Number(json.fuel_liters ?? 0),
        fuel_price_per_l: Number(json.fuel_price_per_l ?? 0),
        cost_per_km_fallback: json.cost_per_km_fallback ?? null,
        tolls_estimate: Number(json.tolls_estimate ?? 0),
        source: json.source,
        fuel_source: json.fuel_source,
      };

      setResult(computed);
      setManualKm(String(computed.km_total));
      setManualMin(String(computed.duration_total_min));
      if (Number.isFinite(computed.fuel_price_per_l) && computed.fuel_price_per_l > 0) {
        setManualFuelPrice(String(computed.fuel_price_per_l));
      }

      await props.onUpdate({
        location_text: cleanedWaypoints[0] ?? baseText.trim(),
        location_lat: props.locationLat ?? null,
        location_lng: props.locationLng ?? null,
        location_address: cleanedWaypoints.join(" → "),
        travel_km: computed.km_total,
        travel_minutes: computed.duration_total_min,
      });

      toast.success("Rota calculada e guardada.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao calcular rota";
      setRouteError(message);
      toast.error(message);
    } finally {
      setCalculating(false);
    }
  };

  const saveManual = async () => {
    const km = parseNumber(manualKm);
    const minutes = parseNumber(manualMin);
    if (!km || km <= 0 || !minutes || minutes <= 0) {
      toast.error("Define km e minutos válidos.");
      return;
    }

    setSavingManual(true);
    try {
      await props.onUpdate({
        location_text: cleanedWaypoints[0] ?? baseText.trim(),
        location_lat: props.locationLat ?? null,
        location_lng: props.locationLng ?? null,
        location_address: cleanedWaypoints.join(" → "),
        travel_km: km,
        travel_minutes: Math.round(minutes),
      });

      setResult((prev) => ({
        km_total: km,
        duration_total_min: Math.round(minutes),
        fuel_cost_estimate: prev?.fuel_cost_estimate ?? 0,
        fuel_liters: prev?.fuel_liters ?? 0,
        fuel_price_per_l: parseNumber(manualFuelPrice) ?? prev?.fuel_price_per_l ?? 0,
        cost_per_km_fallback: parseNumber(manualCostKm),
        tolls_estimate: parseNumber(manualTolls) ?? 0,
        source: "manual",
        fuel_source: prev?.fuel_source ?? "manual",
      }));

      toast.success("Estimativa manual guardada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao guardar estimativa manual.");
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <p className="section-title">Rota multi-ponto</p>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            Origem base + vários destinos. Reordena e calcula km/minutos com fallback manual.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label className="label">Base (origem)</label>
            <input
              className="input"
              value={baseText}
              onChange={(event) => setBaseText(event.target.value)}
              placeholder={DEFAULT_BASE}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
            <input
              type="checkbox"
              checked={roundtrip}
              onChange={(event) => setRoundtrip(event.target.checked)}
            />
            Regressar à base (ida e volta)
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="label !mb-0">Destinos</p>
            <button className="btn btn-ghost btn-sm" onClick={addWaypoint}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar destino
            </button>
          </div>

          {waypoints.map((waypoint, index) => (
            <div
              key={`${index}-${waypoint}`}
              className="grid gap-2 sm:grid-cols-[1fr_auto]"
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex == null) return;
                moveWaypointToIndex(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>
                  {index + 1}
                </span>
                <input
                  className="input"
                  value={waypoint}
                  onChange={(event) => updateWaypoint(index, event.target.value)}
                  placeholder={`Destino ${index + 1}`}
                />
              </div>

              <div className="flex items-center gap-1">
                <button className="btn btn-ghost btn-icon-sm" onClick={() => moveWaypoint(index, -1)} title="Subir">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button className="btn btn-ghost btn-icon-sm" onClick={() => moveWaypoint(index, 1)} title="Descer">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button className="btn btn-ghost btn-icon-sm" onClick={() => removeWaypoint(index)} title="Remover">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <input
            className="input"
            type="number"
            min={0}
            step={0.001}
            value={manualFuelPrice}
            onChange={(event) => setManualFuelPrice(event.target.value)}
            placeholder="Preço combustível €/L"
          />
          <input
            className="input"
            type="number"
            min={0}
            step={0.01}
            value={manualCostKm}
            onChange={(event) => setManualCostKm(event.target.value)}
            placeholder="Custo/km fallback"
          />
          <input
            className="input"
            type="number"
            min={0}
            step={0.01}
            value={manualTolls}
            onChange={(event) => setManualTolls(event.target.value)}
            placeholder="Portagens (€)"
          />
        </div>

        <div className="text-xs" style={{ color: "var(--text-3)" }}>
          Preço semanal combustível: <strong style={{ color: "var(--text)" }}>{manualFuelPrice || "—"} €/L</strong>
          {fuelUpdatedAt ? <> · atualizado em {new Date(fuelUpdatedAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })}</> : null}
          {fuelSourceLabel ? <> · fonte {fuelSourceLabel}</> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary btn-sm" onClick={() => void calculateRoute()} disabled={calculating || loadingStored}>
            {calculating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Route className="h-3.5 w-3.5" />}
            Calcular rota
          </button>
          {loadingStored ? (
            <span className="text-xs" style={{ color: "var(--text-3)" }}>A carregar rota guardada…</span>
          ) : null}
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4" style={{ color: "var(--accent-primary)" }} />
          <p className="section-title">Resultado de logística</p>
        </div>

        {routeError ? (
          <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--warning-border)", background: "var(--warning-bg)", color: "var(--warning)" }}>
            {routeError}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>Distância total</p>
            <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>{result?.km_total ?? parseNumber(manualKm) ?? 0} km</p>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>Tempo total</p>
            <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>
              {minutesToLabel(result?.duration_total_min ?? Math.round(parseNumber(manualMin) ?? 0))}
            </p>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>Combustível</p>
            <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>{(result?.fuel_liters ?? 0).toFixed(2)} L</p>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>Custo estimado</p>
            <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>
              {(result?.fuel_cost_estimate ?? 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
            </p>
          </div>
        </div>

        {result ? (
          <div className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-2)" }}>
            Origem: <strong style={{ color: "var(--text)" }}>{baseText}</strong> <span style={{ color: "var(--text-3)" }}>·</span> Fonte rota: {result.source ?? "-"} <span style={{ color: "var(--text-3)" }}>·</span> Fonte combustível: {result.fuel_source ?? "-"}
          </div>
        ) : null}

        <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Fallback manual (sem APIs)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input"
              type="number"
              min={0}
              step={0.1}
              value={manualKm}
              onChange={(event) => setManualKm(event.target.value)}
              placeholder="KM total"
            />
            <input
              className="input"
              type="number"
              min={0}
              step={1}
              value={manualMin}
              onChange={(event) => setManualMin(event.target.value)}
              placeholder="Minutos totais"
            />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => void saveManual()} disabled={savingManual}>
            {savingManual ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar estimativa manual
          </button>
        </div>

        <div className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-2)" }}>
          <MapPin className="mr-1 inline h-3.5 w-3.5" />
          Base default sugerida: <strong style={{ color: "var(--text)" }}>Setúbal, Portugal</strong>
        </div>
      </div>
    </div>
  );
}
