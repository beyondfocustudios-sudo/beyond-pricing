export type PluginKey = "weather" | "fuel" | "route" | "calendar_ics";

export type PluginDefinition = {
  key: PluginKey;
  label: string;
  ttlSeconds: number;
  fallback: string;
};

export const pluginRegistry: Record<PluginKey, PluginDefinition> = {
  weather: {
    key: "weather",
    label: "Weather",
    ttlSeconds: 60 * 60 * 8,
    fallback: "last_cache_or_manual",
  },
  fuel: {
    key: "fuel",
    label: "Fuel",
    ttlSeconds: 60 * 60 * 24,
    fallback: "org_settings_or_static",
  },
  route: {
    key: "route",
    label: "Routing",
    ttlSeconds: 60 * 60 * 24 * 7,
    fallback: "haversine",
  },
  calendar_ics: {
    key: "calendar_ics",
    label: "Calendar ICS",
    ttlSeconds: 0,
    fallback: "none",
  },
};

export function ttlFromRegistry(key: PluginKey) {
  return pluginRegistry[key].ttlSeconds;
}
