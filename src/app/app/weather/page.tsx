"use client";

import { useState } from "react";
import { Cloud, Wind, Droplets, Sunrise, Sunset, Search } from "lucide-react";

const WMO_DESCRIPTIONS: Record<number, { label: string; emoji: string }> = {
  0: { label: "Céu limpo", emoji: "☀️" },
  1: { label: "Principalmente limpo", emoji: "🌤️" },
  2: { label: "Parcialmente nublado", emoji: "⛅" },
  3: { label: "Nublado", emoji: "☁️" },
  45: { label: "Nevoeiro", emoji: "🌫️" },
  48: { label: "Nevoeiro gelado", emoji: "🌫️" },
  51: { label: "Chuvisco leve", emoji: "🌦️" },
  53: { label: "Chuvisco moderado", emoji: "🌦️" },
  55: { label: "Chuvisco intenso", emoji: "🌧️" },
  61: { label: "Chuva leve", emoji: "🌧️" },
  63: { label: "Chuva moderada", emoji: "🌧️" },
  65: { label: "Chuva intensa", emoji: "🌧️" },
  71: { label: "Neve leve", emoji: "🌨️" },
  73: { label: "Neve moderada", emoji: "🌨️" },
  75: { label: "Neve intensa", emoji: "❄️" },
  80: { label: "Aguaceiros leves", emoji: "🌦️" },
  81: { label: "Aguaceiros moderados", emoji: "🌧️" },
  82: { label: "Aguaceiros violentos", emoji: "⛈️" },
  95: { label: "Trovoada", emoji: "⛈️" },
  96: { label: "Trovoada com granizo", emoji: "⛈️" },
  99: { label: "Trovoada com granizo forte", emoji: "⛈️" },
};

const QUICK_CITIES = ["Lisboa", "Porto", "Braga", "Faro", "Funchal"];

interface HourlyData {
  time: string[];
  temperature_2m: number[];
  weathercode: number[];
}

interface WeatherData {
  location: string;
  date: string;
  weathercode: number;
  temperature_max: number;
  temperature_min: number;
  precipitation_sum: number;
  windspeed_max: number;
  sunrise: string;
  sunset: string;
  hourly?: HourlyData;
  fromCache?: boolean;
}

export default function WeatherPage() {
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = async (loc?: string) => {
    const q = loc ?? location;
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params = new URLSearchParams({ location: q, date });
      const res = await fetch(`/api/weather?${params}`);
      const json = await res.json() as WeatherData & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Erro ao obter dados");
      } else {
        setData(json);
      }
    } catch {
      setError("Erro de ligação");
    } finally {
      setLoading(false);
    }
  };

  const wmo = data ? (WMO_DESCRIPTIONS[data.weathercode] ?? { label: "Desconhecido", emoji: "🌡️" }) : null;

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Cloud className="h-6 w-6" style={{ color: "var(--accent)" }} />
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>Meteorologia</h1>
          <p className="text-sm" style={{ color: "var(--text-3)" }}>Previsão do tempo</p>
        </div>
      </div>

      <div className="card-glass rounded-xl p-5 space-y-4">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Cidade ou local..."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchWeather()}
          />
          <input
            className="input w-40"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => fetchWeather()} disabled={loading || !location.trim()}>
            <Search className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {QUICK_CITIES.map((city) => (
            <button
              key={city}
              className="btn btn-ghost btn-sm"
              onClick={() => { setLocation(city); fetchWeather(city); }}
            >
              {city}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="card-glass rounded-xl p-10 text-center">
          <div className="animate-spin h-8 w-8 border-2 rounded-full mx-auto" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
          <p className="mt-3 text-sm" style={{ color: "var(--text-3)" }}>A carregar...</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {data && wmo && (
        <div className="space-y-4">
          <div className="card-glass rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>{data.location}</p>
                <p className="text-sm" style={{ color: "var(--text-3)" }}>
                  {new Date(data.date).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              {data.fromCache && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>cache</span>
              )}
            </div>

            <div className="flex items-center gap-4">
              <span className="text-6xl">{wmo.emoji}</span>
              <div>
                <p className="text-lg font-semibold" style={{ color: "var(--text)" }}>{wmo.label}</p>
                <p className="text-3xl font-bold" style={{ color: "var(--accent)" }}>
                  {data.temperature_min.toFixed(0)}° – {data.temperature_max.toFixed(0)}°C
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--surface-2)" }}>
                <Droplets className="h-4 w-4 mx-auto mb-1" style={{ color: "#60a5fa" }} />
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{data.precipitation_sum.toFixed(1)} mm</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>Precipitação</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--surface-2)" }}>
                <Wind className="h-4 w-4 mx-auto mb-1" style={{ color: "#94a3b8" }} />
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{data.windspeed_max.toFixed(0)} km/h</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>Vento máx.</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--surface-2)" }}>
                <Sunrise className="h-4 w-4 mx-auto mb-1" style={{ color: "#fbbf24" }} />
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{formatTime(data.sunrise)}</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>Nascer sol</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--surface-2)" }}>
                <Sunset className="h-4 w-4 mx-auto mb-1" style={{ color: "#f97316" }} />
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{formatTime(data.sunset)}</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>Pôr do sol</p>
              </div>
            </div>
          </div>

          {data.hourly && (
            <div className="card-glass rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>Previsão horária</p>
              <div className="overflow-x-auto">
                <div className="flex gap-3 pb-2" style={{ minWidth: "max-content" }}>
                  {data.hourly.time.map((t, i) => {
                    const h = new Date(t).getHours();
                    const hourWmo = WMO_DESCRIPTIONS[data.hourly!.weathercode[i]] ?? { emoji: "🌡️" };
                    return (
                      <div key={t} className="flex flex-col items-center gap-1 min-w-[48px] rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
                        <span className="text-xs" style={{ color: "var(--text-3)" }}>{h.toString().padStart(2, "0")}h</span>
                        <span className="text-lg">{hourWmo.emoji}</span>
                        <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{data.hourly!.temperature_2m[i].toFixed(0)}°</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
