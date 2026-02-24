"use client";

import { useState, useEffect } from "react";
import { MapPin, Clock, Truck, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "./Toast";

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

interface WeatherDay {
  date: string;
  temp_max: number;
  temp_min: number;
  precipitation_sum: number;
  weather_code: number;
}

interface OpenMeteoResponse {
  daily?: {
    date: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weather_code: number[];
  };
}

const WMO_CONDITIONS: Record<number, { emoji: string; label: string }> = {
  0: { emoji: "☀️", label: "Céu limpo" },
  1: { emoji: "🌤️", label: "Principalmente limpo" },
  2: { emoji: "⛅", label: "Parcialmente nublado" },
  3: { emoji: "☁️", label: "Nublado" },
  45: { emoji: "🌫️", label: "Nevoeiro" },
  61: { emoji: "🌧️", label: "Chuva leve" },
  63: { emoji: "🌧️", label: "Chuva" },
  65: { emoji: "⛈️", label: "Chuva forte" },
  80: { emoji: "🌦️", label: "Aguaceiros" },
};

export function ProjectLogisticsTab(props: LogisticsTabProps) {
  const toast = useToast();
  const [locationInput, setLocationInput] = useState(props.locationText || "");
  const [searching, setSearching] = useState(false);
  const [weatherData, setWeatherData] = useState<WeatherDay[]>([]);
  const [loadingWeather, setLoadingWeather] = useState(false);

  // Fetch weather when location is set
  useEffect(() => {
    if (!props.locationLat || !props.locationLng) return;

    const fetchWeather = async () => {
      setLoadingWeather(true);
      try {
        const res = await fetch(
          `/api/weather/forecast?lat=${props.locationLat}&lng=${props.locationLng}`
        );
        if (!res.ok) throw new Error("Failed to fetch weather");

        const data = (await res.json()) as OpenMeteoResponse;
        if (data.daily) {
          const days: WeatherDay[] = data.daily.date.map((date, i) => ({
            date,
            temp_max: data.daily!.temperature_2m_max[i],
            temp_min: data.daily!.temperature_2m_min[i],
            precipitation_sum: data.daily!.precipitation_sum[i],
            weather_code: data.daily!.weather_code[i],
          }));
          setWeatherData(days.slice(0, 7)); // Show next 7 days
        }
      } catch (err) {
        console.error("Weather fetch failed:", err);
      } finally {
        setLoadingWeather(false);
      }
    };

    fetchWeather();
  }, [props.locationLat, props.locationLng]);

  const handleGeocode = async () => {
    if (!locationInput.trim()) {
      toast.error("Introduz um local");
      return;
    }

    setSearching(true);
    try {
      // Use existing geocode endpoint
      const res = await fetch(`/api/geo/geocode?q=${encodeURIComponent(locationInput)}`);

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || "Geocoding failed");
      }

      const { lat, lng, address, name } = await res.json() as {
        lat: number;
        lng: number;
        address: string;
        name: string;
      };

      // Fetch route from base location
      const routeRes = await fetch(
        `/api/geo/route?lat=${lat}&lng=${lng}`
      );
      let travelKm = 0;
      let travelMin = 0;
      if (routeRes.ok) {
        const routeData = await routeRes.json() as {
          travel_km: number;
          travel_minutes: number;
        };
        travelKm = routeData.travel_km;
        travelMin = routeData.travel_minutes;
      }

      // Update project
      await props.onUpdate({
        location_text: name,
        location_lat: lat,
        location_lng: lng,
        location_address: address,
        travel_km: travelKm,
        travel_minutes: travelMin,
      });

      toast.success(`Local: ${name} (${travelKm}km, ${travelMin}min)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao geocodificar");
    } finally {
      setSearching(false);
    }
  };

  const handleClear = async () => {
    await props.onUpdate({
      location_text: null,
      location_lat: null,
      location_lng: null,
      location_address: null,
      travel_km: null,
      travel_minutes: null,
    });
    setLocationInput("");
    setWeatherData([]);
    toast.success("Local removido");
  };

  return (
    <div className="space-y-4">
      {/* Location Input */}
      <div className="card space-y-3">
        <div>
          <label className="section-title">Local de Produção</label>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            Introduz uma cidade ou morada para calcular distância e ver previsão
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGeocode()}
            placeholder="Ex: Lisboa, Porto, ou rua..."
            className="input flex-1"
            disabled={searching}
          />
          <button
            onClick={handleGeocode}
            disabled={searching || !locationInput.trim()}
            className="btn btn-primary"
          >
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MapPin className="w-4 h-4" />
            )}
          </button>
        </div>

        {props.locationText && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 dark:bg-blue-950 dark:border-blue-800">
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm">{props.locationText}</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>
                    {props.locationAddress}
                  </p>
                </div>
                <button
                  onClick={handleClear}
                  className="text-xs underline"
                  style={{ color: "var(--error)" }}
                >
                  Remover
                </button>
              </div>

              {(props.travelKm || props.travelMinutes) && (
                <div className="flex gap-4 text-sm">
                  {props.travelKm && (
                    <div className="flex items-center gap-1">
                      <Truck className="w-4 h-4" style={{ color: "var(--accent)" }} />
                      <span>{props.travelKm} km</span>
                    </div>
                  )}
                  {props.travelMinutes && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" style={{ color: "var(--accent)" }} />
                      <span>{props.travelMinutes} min</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Weather Forecast */}
      {props.locationLat && props.locationLng && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <label className="section-title">Previsão Meteorológica</label>
            {loadingWeather && <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} />}
          </div>

          {weatherData.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {weatherData.map((day) => {
                const condition = WMO_CONDITIONS[day.weather_code] || {
                  emoji: "❓",
                  label: `Código ${day.weather_code}`,
                };

                return (
                  <div
                    key={day.date}
                    className="p-2 rounded-lg"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <p className="text-xs font-medium mb-1">
                      {new Date(day.date).toLocaleDateString("pt-PT", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-2xl mb-1">{condition.emoji}</p>
                    <p className="text-xs mb-1.5" style={{ color: "var(--text-3)" }}>
                      {condition.label}
                    </p>
                    <div className="space-y-0.5 text-xs">
                      <p>
                        <span style={{ color: "var(--text)" }}>
                          {Math.round(day.temp_max)}°
                        </span>
                        <span style={{ color: "var(--text-3)" }}>
                          {" /"} {Math.round(day.temp_min)}°
                        </span>
                      </p>
                      {day.precipitation_sum > 0 && (
                        <p style={{ color: "var(--warning)" }}>
                          💧 {day.precipitation_sum}mm
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : loadingWeather ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} />
            </div>
          ) : (
            <div
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{
                background: "var(--warning-bg)",
                border: "1px solid var(--warning-border)",
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--warning)" }} />
              <p className="text-sm" style={{ color: "var(--warning)" }}>
                Não foi possível carregar previsão
              </p>
            </div>
          )}
        </div>
      )}

      {/* Fuel Cost Estimate */}
      {props.travelKm && (
        <div className="card space-y-2">
          <p className="section-title">Estimativa de Custo de Combustível</p>
          <div
            className="p-3 rounded-lg"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <p className="text-sm">
              <span style={{ color: "var(--text-3)" }}>Ida e volta:</span>
              <span className="ml-2 font-medium">
                {(props.travelKm * 2).toFixed(1)} km
              </span>
            </p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              (Usar valores padrão da org ou adicionar combustível como item)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
