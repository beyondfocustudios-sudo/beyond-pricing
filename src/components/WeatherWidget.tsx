"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";

interface WeatherDay {
  date: string;
  code: number;
  description: string;
  temp_max: number;
  temp_min: number;
  precipitation: number;
  wind_max: number;
}

interface WeatherData {
  lat: number;
  lng: number;
  forecast_start: string;
  forecast_end: string;
  days: WeatherDay[];
  fetched_at: string;
}

interface WeatherWidgetProps {
  lat: number;
  lng: number;
  projectId?: string;
  startDate?: string;
  endDate?: string;
  onSnapshot?: (data: WeatherData) => void;
}

export function WeatherWidget({ lat, lng, projectId, startDate, endDate, onSnapshot }: WeatherWidgetProps) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable ref for onSnapshot to avoid re-triggering fetchWeather on every render
  const onSnapshotRef = useRef(onSnapshot);
  useEffect(() => { onSnapshotRef.current = onSnapshot; }, [onSnapshot]);

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
      if (projectId) params.set("projectId", projectId);
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);

      const res = await fetch(`/api/weather?${params}`);
      if (!res.ok) throw new Error("Erro ao obter previsão");
      const json = await res.json() as WeatherData;
      setData(json);
      onSnapshotRef.current?.(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [lat, lng, projectId, startDate, endDate]);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  const isRainy = (day: WeatherDay) => day.precipitation > 5 || [61, 63, 65, 80, 81, 82, 95, 96, 99].includes(day.code);
  const isWindy = (day: WeatherDay) => day.wind_max > 40;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" });
  };

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-4" style={{ color: "var(--text-3)" }}>
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="text-sm">A obter previsão meteorológica…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between py-3 px-4 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--error)" }}>
        <span className="text-sm">{error}</span>
        <button onClick={fetchWeather} className="btn btn-ghost btn-sm text-xs">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          Previsão Meteorológica
        </p>
        <div className="flex items-center gap-2">
          {data.fetched_at && (
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              {new Date(data.fetched_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={fetchWeather}
            disabled={loading}
            className="btn btn-ghost btn-icon-sm"
            title="Atualizar previsão"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Days grid */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
        {data.days.map((day) => {
          const rainy = isRainy(day);
          const windy = isWindy(day);
          const warn = rainy || windy;

          return (
            <div
              key={day.date}
              className="rounded-xl px-3 py-3 space-y-1.5"
              style={{
                background: warn ? "rgba(239,68,68,0.06)" : "var(--surface-2)",
                border: `1px solid ${warn ? "rgba(239,68,68,0.2)" : "var(--border)"}`,
              }}
            >
              <p className="text-xs font-medium" style={{ color: "var(--text-3)" }}>
                {formatDate(day.date)}
              </p>
              <p className="text-lg leading-none">{day.description.split(" ")[0]}</p>
              <p className="text-xs" style={{ color: "var(--text-2)" }}>
                {day.description.split(" ").slice(1).join(" ")}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold" style={{ color: "var(--accent-2)" }}>
                  {Math.round(day.temp_max)}°
                </span>
                <span className="text-xs" style={{ color: "var(--text-3)" }}>
                  / {Math.round(day.temp_min)}°
                </span>
              </div>
              {day.precipitation > 0 && (
                <p className="text-xs" style={{ color: rainy ? "#ef4444" : "var(--text-3)" }}>
                  💧 {day.precipitation.toFixed(1)} mm
                </p>
              )}
              {windy && (
                <p className="text-xs" style={{ color: "#f97316" }}>
                  💨 {Math.round(day.wind_max)} km/h
                </p>
              )}
              {warn && (
                <span
                  className="inline-block text-xs px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}
                >
                  {rainy ? "Chuva" : "Vento"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        Fonte: Open-Meteo · Coordenadas: {lat.toFixed(4)}, {lng.toFixed(4)}
      </p>
    </div>
  );
}
