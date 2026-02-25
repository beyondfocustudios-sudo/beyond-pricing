import { createServiceClient } from "@/lib/supabase/service";
import type { PluginKey } from "@/lib/plugins/registry";

export async function logPluginRun(params: {
  pluginKey: PluginKey;
  status: "ok" | "error";
  cacheHit?: boolean;
  error?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    const admin = createServiceClient();

    await admin.from("plugin_runs").insert({
      plugin_key: params.pluginKey,
      status: params.status,
      cache_hit: Boolean(params.cacheHit),
      error: params.error ?? null,
      meta: params.meta ?? {},
    });

    const statusPayload = {
      plugin_key: params.pluginKey,
      enabled: true,
      last_success_at: params.status === "ok" ? new Date().toISOString() : null,
      last_error_at: params.status === "error" ? new Date().toISOString() : null,
      last_error: params.status === "error" ? params.error ?? "Plugin error" : null,
      updated_at: new Date().toISOString(),
    };

    await admin.from("plugin_status").upsert(statusPayload, { onConflict: "plugin_key" });
  } catch {
    // Non-blocking diagnostics logging.
  }
}
