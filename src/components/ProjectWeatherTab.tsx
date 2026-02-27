"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CloudSun, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";

type WeatherDay = {
  date: string;
  temp_max: number;
  temp_min: number;
  precipitation_sum: number;
  weather_code: number;
  weather_label?: string;
  windspeed_max?: number;
};

type Props = {
  locationText: string | null;
  locationLat: number | null;
  locationLng: number | null;
  shootDays: string[];
  onSaveShootDays: (days: string[]) => Promise<void>;
};

const WMO: Record<number, { emoji: string; label: string }> = {
  0: { emoji: "☀️", label: "Céu limpo" },
  1: { emoji: "🌤️", label: "Principalmente limpo" },
  2: { emoji: "⛅", label: "Parcialmente nublado" },
  3: { emoji: "☁️", label: "Nublado" },
  45: { emoji: "🌫️", label: "Nevoeiro" },
  61: { emoji: "🌧️", label: "Chuva leve" },
  63: { emoji: "🌧️", label: "Chuva" },
  65: { emoji: "⛈️", label: "Chuva forte" },
  80: { emoji: "🌦️", label: "Aguaceiros" },
  95: { emoji: "⛈️", label: "Trovoada" },
};

function normalizeDay(value: string) {
  const iso = new Date(value).toISOString().slice(0, 10);
  return iso;
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ProjectWeatherTab(props: Props) {
  const toast = useToast();
  const [days, setDays] = useState<string[]>(props.shootDays);
  const [newDay, setNewDay] = useState("");
  const [savingDays, setSavingDays] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weatherDays, setWeatherDays] = useState<WeatherDay[]>([]);

  useEffect(() => {
    setDays(props.shootDays);
  }, [props.shootDays]);

  const sortedDays = useMemo(
    () => [...new Set(days.map(normalizeDay))].sort((a, b) => a.localeCompare(b)),
    [days],
  );

  const fetchWeather = useCallback(async () => {
    if (sortedDays.length === 0) {
      setWeatherDays([]);
      setError(null);
      return;
    }

    if (!props.locationText && (!props.locationLat || !props.locationLng)) {
      setError("Define primeiro a localização do projeto na aba Logística.");
      setWeatherDays([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (props.locationLat && props.locationLng) {
        params.set("lat", String(props.locationLat));
        params.set("lng", String(props.locationLng));
      } else if (props.locationText) {
        params.set("location", props.locationText);
      }
      params.set("dates", sortedDays.join(","));

      const res = await fetch(`/api/plugins/weather?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        warning?: string;
        days?: WeatherDay[];
      };

      if (!res.ok) {
        throw new Error(json.error ?? "Não foi possível carregar previsão.");
      }

      setWeatherDays(json.days ?? []);
      if (json.warning) {
        setError(json.warning);
      }
    } catch (err) {
      setWeatherDays([]);
      setError(err instanceof Error ? err.message : "Falha a carregar previsão.");
    } finally {
      setLoading(false);
    }
  }, [props.locationLat, props.locationLng, props.locationText, sortedDays]);

  useEffect(() => {
    void fetchWeather();
  }, [fetchWeather]);

  const persistShootDays = async (nextDays: string[]) => {
    setSavingDays(true);
    try {
      await props.onSaveShootDays(nextDays);
      toast.success("Dias de rodagem guardados.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha a guardar dias de rodagem.");
    } finally {
      setSavingDays(false);
    }
  };

  const addShootDay = async () => {
    if (!newDay) return;
    const normalized = normalizeDay(newDay);
    const next = [...new Set([...sortedDays, normalized])].sort((a, b) => a.localeCompare(b));
    setDays(next);
    setNewDay("");
    await persistShootDays(next);
  };

  const removeShootDay = async (day: string) => {
    const next = sortedDays.filter((item) => item !== day);
    setDays(next);
    await persistShootDays(next);
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-title">Tempo por dia de rodagem</p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Define as datas de shoot para previsão detalhada (temperatura, precipitação e vento).
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => void fetchWeather()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={newDay}
            onChange={(event) => setNewDay(event.target.value)}
            className="input"
          />
          <button className="btn btn-primary btn-sm" onClick={() => void addShootDay()} disabled={!newDay || savingDays}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar dia
          </button>
        </div>

        {sortedDays.length === 0 ? (
          <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--surface-2)" }}>
            Sem datas de rodagem definidas.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sortedDays.map((day) => (
              <div
                key={day}
                className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
                  {formatDay(day)}
                </span>
                <button className="btn btn-ghost btn-icon-sm" onClick={() => void removeShootDay(day)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <CloudSun className="h-4 w-4" style={{ color: "var(--accent-primary)" }} />
          <p className="section-title">Previsão</p>
        </div>

        {error ? (
          <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--warning-border)", background: "var(--warning-bg)", color: "var(--warning)" }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-3)" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar previsão…
          </div>
        ) : weatherDays.length === 0 ? (
          <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--surface-2)" }}>
            Sem previsão disponível.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {weatherDays.map((day) => {
              const condition = WMO[day.weather_code] ?? { emoji: "❓", label: day.weather_label ?? `Código ${day.weather_code}` };
              return (
                <article
                  key={day.date}
                  className="rounded-xl border p-3"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs" style={{ color: "var(--text-3)" }}>
                        <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                        {formatDay(day.date)}
                      </p>
                      <p className="mt-1 text-sm font-medium" style={{ color: "var(--text)" }}>
                        {condition.label}
                      </p>
                    </div>
                    <span className="text-2xl">{condition.emoji}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p style={{ color: "var(--text-3)" }}>Temp</p>
                      <p style={{ color: "var(--text)" }}>{Math.round(day.temp_min)}° / {Math.round(day.temp_max)}°</p>
                    </div>
                    <div>
                      <p style={{ color: "var(--text-3)" }}>Chuva</p>
                      <p style={{ color: "var(--text)" }}>{day.precipitation_sum ?? 0} mm</p>
                    </div>
                    <div>
                      <p style={{ color: "var(--text-3)" }}>Vento</p>
                      <p style={{ color: "var(--text)" }}>{Math.round(day.windspeed_max ?? 0)} km/h</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
