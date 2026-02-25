"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin, Clock, Truck, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { z } from "zod";
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
  weather_label?: string;
}

const weatherDaySchema = z.object({
  date: z.string(),
  temp_max: z.coerce.number(),
  temp_min: z.coerce.number(),
  precipitation_sum: z.coerce.number(),
  weather_code: z.coerce.number(),
  weather_label: z.string().optional(),
});

const weatherPluginResponseSchema = z.object({
  days: z.array(weatherDaySchema).optional(),
  warning: z.string().optional(),
  stale: z.boolean().optional(),
  source: z.string().optional(),
  error: z.string().optional(),
}).passthrough();

const routePluginResponseSchema = z.object({
  travel_km: z.coerce.number(),
  travel_minutes: z.coerce.number(),
  warning: z.string().optional(),
  source: z.string().optional(),
}).passthrough();

const fuelPluginResponseSchema = z.object({
  price_per_liter: z.coerce.number().optional(),
  fallback_price: z.coerce.number().optional(),
  source: z.string().optional(),
  warning: z.string().optional(),
  error: z.string().optional(),
}).passthrough();

const geocodeResponseSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  address: z.string(),
  name: z.string(),
});

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

const BEYOND_BASE = { lat: 38.5243, lng: -8.8926 };
const DEFAULT_CONSUMPTION_PER_100KM = 7.5;

export function ProjectLogisticsTab(props: LogisticsTabProps) {
  const toast = useToast();
  const [locationInput, setLocationInput] = useState(props.locationText || "");
  const [searching, setSearching] = useState(false);

  const [weatherData, setWeatherData] = useState<WeatherDay[]>([]);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [manualWeatherNote, setManualWeatherNote] = useState("");

  const [fuelPrice, setFuelPrice] = useState<number | null>(null);
  const [fuelSource, setFuelSource] = useState<string | null>(null);
  const [fuelLoading, setFuelLoading] = useState(false);
  const [fuelError, setFuelError] = useState<string | null>(null);

  const [manualTravelKm, setManualTravelKm] = useState(props.travelKm ? String(props.travelKm) : "");
  const [manualTravelMinutes, setManualTravelMinutes] = useState(props.travelMinutes ? String(props.travelMinutes) : "");
  const [manualFuelPrice, setManualFuelPrice] = useState("");

  useEffect(() => {
    setLocationInput(props.locationText ?? "");
  }, [props.locationText]);

  useEffect(() => {
    setManualTravelKm(props.travelKm != null ? String(props.travelKm) : "");
  }, [props.travelKm]);

  useEffect(() => {
    setManualTravelMinutes(props.travelMinutes != null ? String(props.travelMinutes) : "");
  }, [props.travelMinutes]);

  const effectiveTravelKm = props.travelKm ?? (Number(manualTravelKm) > 0 ? Number(manualTravelKm) : null);

  const fetchWeather = useCallback(async () => {
    if (!props.locationLat || !props.locationLng) {
      setWeatherData([]);
      setWeatherError(null);
      return;
    }

    setLoadingWeather(true);
    setWeatherError(null);
    try {
      const res = await fetch(`/api/plugins/weather?lat=${props.locationLat}&lng=${props.locationLng}`);
      const raw = await res.json().catch(() => ({}));
      const parsed = weatherPluginResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("Resposta inválida do serviço de weather");
      }
      if (!res.ok) {
        throw new Error(parsed.data.error || "Falha a carregar weather");
      }

      const days = (parsed.data.days ?? []).map((day) => ({
        date: day.date,
        temp_max: day.temp_max,
        temp_min: day.temp_min,
        precipitation_sum: day.precipitation_sum,
        weather_code: day.weather_code,
        weather_label: day.weather_label,
      }));
      setWeatherData(days.slice(0, 7));

      if (parsed.data.warning) {
        setWeatherError(parsed.data.warning);
      }
    } catch (err) {
      setWeatherData([]);
      setWeatherError(err instanceof Error ? err.message : "Não foi possível carregar previsão");
    } finally {
      setLoadingWeather(false);
    }
  }, [props.locationLat, props.locationLng]);

  const fetchFuel = useCallback(async () => {
    if (!effectiveTravelKm || effectiveTravelKm <= 0) {
      setFuelPrice(null);
      setFuelSource(null);
      setFuelError(null);
      return;
    }

    setFuelLoading(true);
    setFuelError(null);
    try {
      const res = await fetch("/api/plugins/fuel?country=PT&type=diesel");
      const raw = await res.json().catch(() => ({}));
      const parsed = fuelPluginResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("Resposta inválida do serviço de combustível");
      }

      if (!res.ok) {
        if (typeof parsed.data.fallback_price === "number") {
          setFuelPrice(parsed.data.fallback_price);
          setFuelSource("fallback_manual");
          setFuelError(parsed.data.error ?? "API indisponível — a usar fallback.");
          return;
        }
        throw new Error(parsed.data.error || "Sem preço de combustível");
      }

      if (typeof parsed.data.price_per_liter !== "number") {
        throw new Error("Sem preço válido no payload");
      }
      setFuelPrice(parsed.data.price_per_liter);
      setFuelSource(parsed.data.source ?? "fallback");
      if (parsed.data.warning) setFuelError(parsed.data.warning);
    } catch (err) {
      setFuelPrice(null);
      setFuelSource(null);
      setFuelError(err instanceof Error ? err.message : "Sem preço de combustível");
    } finally {
      setFuelLoading(false);
    }
  }, [effectiveTravelKm]);

  useEffect(() => {
    void fetchWeather();
  }, [fetchWeather]);

  useEffect(() => {
    void fetchFuel();
  }, [fetchFuel]);

  const handleGeocode = async () => {
    if (!locationInput.trim()) {
      toast.error("Introduz um local");
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/geo/geocode?q=${encodeURIComponent(locationInput)}`);
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof (raw as { error?: unknown }).error === "string"
          ? (raw as { error: string }).error
          : "Geocoding failed";
        throw new Error(message);
      }

      const geocodeParsed = geocodeResponseSchema.safeParse(raw);
      if (!geocodeParsed.success) {
        throw new Error("Resposta inválida de geocoding");
      }
      const { lat, lng, address, name } = geocodeParsed.data;

      const routeRes = await fetch(
        `/api/plugins/route?from=Setubal&fromLat=${BEYOND_BASE.lat}&fromLng=${BEYOND_BASE.lng}&to=${encodeURIComponent(name)}&toLat=${lat}&toLng=${lng}`,
      );
      const routeRaw = await routeRes.json().catch(() => ({}));
      const routeParsed = routePluginResponseSchema.safeParse(routeRaw);

      let travelKm: number | null = null;
      let travelMin: number | null = null;

      if (routeParsed.success) {
        travelKm = routeParsed.data.travel_km;
        travelMin = routeParsed.data.travel_minutes;
        if (routeParsed.data.warning) {
          toast.info(routeParsed.data.warning);
        }
      }

      await props.onUpdate({
        location_text: name,
        location_lat: lat,
        location_lng: lng,
        location_address: address,
        travel_km: travelKm,
        travel_minutes: travelMin,
      });

      setManualTravelKm(travelKm != null ? String(travelKm) : "");
      setManualTravelMinutes(travelMin != null ? String(travelMin) : "");

      toast.success(
        travelKm != null && travelMin != null
          ? `Local: ${name} (${travelKm}km, ${travelMin}min)`
          : `Local definido: ${name}. Sem rota automática, usa estimativa manual.`,
      );
      void fetchWeather();
      void fetchFuel();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao geocodificar");
    } finally {
      setSearching(false);
    }
  };

  const handleSaveManualRoute = async () => {
    const km = Number(manualTravelKm);
    const minutes = Number(manualTravelMinutes);

    if (!Number.isFinite(km) || km <= 0 || !Number.isFinite(minutes) || minutes <= 0) {
      toast.error("Define km e minutos válidos para guardar estimativa manual.");
      return;
    }

    await props.onUpdate({
      location_text: props.locationText ?? null,
      location_lat: props.locationLat ?? null,
      location_lng: props.locationLng ?? null,
      location_address: props.locationAddress ?? null,
      travel_km: Math.round(km * 10) / 10,
      travel_minutes: Math.round(minutes),
    });

    toast.success("Estimativa manual guardada.");
    void fetchFuel();
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
    setWeatherError(null);
    setFuelPrice(null);
    setFuelSource(null);
    setFuelError(null);
    setManualTravelKm("");
    setManualTravelMinutes("");
    setManualFuelPrice("");
    setManualWeatherNote("");
    toast.success("Local removido");
  };

  const parsedManualFuel = Number(manualFuelPrice);
  const effectiveFuelPrice = fuelPrice ?? (Number.isFinite(parsedManualFuel) && parsedManualFuel > 0 ? parsedManualFuel : null);
  const estimatedFuelCost = effectiveTravelKm && effectiveFuelPrice
    ? (((effectiveTravelKm * 2) * DEFAULT_CONSUMPTION_PER_100KM) / 100) * effectiveFuelPrice
    : null;

  return (
    <div className="space-y-4">
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
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{props.locationText}</p>
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
                  {props.travelKm ? (
                    <div className="flex items-center gap-1">
                      <Truck className="w-4 h-4" style={{ color: "var(--accent)" }} />
                      <span>{props.travelKm} km</span>
                    </div>
                  ) : null}
                  {props.travelMinutes ? (
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" style={{ color: "var(--accent)" }} />
                      <span>{props.travelMinutes} min</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
            Fallback manual (se rota/API falhar)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="number"
              min={0}
              step={0.1}
              value={manualTravelKm}
              onChange={(event) => setManualTravelKm(event.target.value)}
              className="input"
              placeholder="Distância (km)"
            />
            <input
              type="number"
              min={0}
              step={1}
              value={manualTravelMinutes}
              onChange={(event) => setManualTravelMinutes(event.target.value)}
              className="input"
              placeholder="Tempo (min)"
            />
          </div>
          <button onClick={() => void handleSaveManualRoute()} className="btn btn-secondary btn-sm">
            Guardar estimativa manual
          </button>
        </div>
      </div>

      {props.locationLat && props.locationLng ? (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <label className="section-title">Previsão Meteorológica</label>
            <div className="flex items-center gap-2">
              {loadingWeather ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-3)" }} /> : null}
              <button onClick={() => void fetchWeather()} className="btn btn-ghost btn-sm text-xs" disabled={loadingWeather}>
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar agora
              </button>
            </div>
          </div>

          {weatherData.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {weatherData.map((day) => {
                const condition = WMO_CONDITIONS[day.weather_code] || {
                  emoji: "❓",
                  label: day.weather_label || `Código ${day.weather_code}`,
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
                      {day.precipitation_sum > 0 ? (
                        <p style={{ color: "var(--warning)" }}>
                          💧 {day.precipitation_sum}mm
                        </p>
                      ) : null}
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
            <div className="space-y-2">
              <div
                className="flex items-center gap-2 p-3 rounded-lg"
                style={{
                  background: "var(--warning-bg)",
                  border: "1px solid var(--warning-border)",
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "var(--warning)" }} />
                <p className="text-sm" style={{ color: "var(--warning)" }}>
                  {weatherError ?? "Não foi possível carregar previsão"}
                </p>
              </div>
              <textarea
                value={manualWeatherNote}
                onChange={(event) => setManualWeatherNote(event.target.value)}
                className="input w-full"
                rows={2}
                placeholder="Nota manual (ex.: confirmar risco de chuva e plano B indoor)"
              />
            </div>
          )}
        </div>
      ) : null}

      {(effectiveTravelKm && effectiveTravelKm > 0) ? (
        <div className="card space-y-2">
          <p className="section-title">Estimativa de Custo de Combustível</p>
          <div
            className="p-3 rounded-lg space-y-1.5"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <p className="text-sm">
              <span style={{ color: "var(--text-3)" }}>Ida e volta:</span>
              <span className="ml-2 font-medium">
                {(effectiveTravelKm * 2).toFixed(1)} km
              </span>
            </p>

            {fuelLoading ? (
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                A carregar preço de combustível...
              </p>
            ) : null}

            {fuelError ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: "var(--warning-border)", background: "var(--warning-bg)" }}>
                <span className="text-xs" style={{ color: "var(--warning)" }}>{fuelError}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => void fetchFuel()} disabled={fuelLoading}>
                  Retry
                </button>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <label className="text-xs" style={{ color: "var(--text-3)" }}>
                  Preço manual (€/L) caso API falhe
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.001}
                  className="input mt-1"
                  placeholder="Ex: 1.620"
                  value={manualFuelPrice}
                  onChange={(event) => setManualFuelPrice(event.target.value)}
                />
              </div>
              {effectiveFuelPrice ? (
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  Fonte: {fuelPrice ? (fuelSource ?? "api") : "manual"}
                </p>
              ) : null}
            </div>

            {estimatedFuelCost != null && effectiveFuelPrice != null ? (
              <p className="text-sm">
                <span style={{ color: "var(--text-3)" }}>Combustível estimado:</span>
                <span className="ml-2 font-medium">
                  {estimatedFuelCost.toFixed(2)} €
                </span>
                <span className="ml-2 text-xs" style={{ color: "var(--text-3)" }}>
                  ({effectiveFuelPrice.toFixed(3)} €/L)
                </span>
              </p>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                Sem preço automático disponível. Define preço manual para calcular.
              </p>
            )}

            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              (Cache 24h + fallback manual)
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
