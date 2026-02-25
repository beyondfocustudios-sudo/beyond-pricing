"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { IVA_REGIMES, DEFAULT_PREFERENCES, type IvaRegime } from "@/lib/types";
import { Save, Settings, Sparkles } from "lucide-react";

interface PrefsState {
  iva_regime: IvaRegime;
  overhead_pct: number;
  contingencia_pct: number;
  margem_alvo_pct: number;
  margem_minima_pct: number;
  investimento_pct: number;
  moeda: string;
  ai_tagging_enabled?: boolean;
}

interface NotificationPrefs {
  in_app: boolean;
  email: boolean;
  new_comments: boolean;
  new_versions: boolean;
  approvals: boolean;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  in_app: true,
  email: true,
  new_comments: true,
  new_versions: true,
  approvals: true,
};

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<PrefsState>({ ...DEFAULT_PREFERENCES });
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const [{ data, error: prefError }, { data: userPrefs }, roleRes] = await Promise.all([
          sb.from("preferences").select("*").eq("user_id", user.id).maybeSingle(),
          sb.from("user_preferences").select("notification_prefs").eq("user_id", user.id).maybeSingle(),
          fetch("/api/admin/org-role").catch(() => null),
        ]);

        if (!data && !prefError) {
          await sb.from("preferences").upsert(
            { user_id: user.id, ...DEFAULT_PREFERENCES, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
        }

        const source = data ?? DEFAULT_PREFERENCES;
        setPrefs({
          iva_regime: (source.iva_regime as IvaRegime | undefined) ?? DEFAULT_PREFERENCES.iva_regime,
          overhead_pct: Number(source.overhead_pct ?? DEFAULT_PREFERENCES.overhead_pct),
          contingencia_pct: Number(source.contingencia_pct ?? DEFAULT_PREFERENCES.contingencia_pct),
          margem_alvo_pct: Number(source.margem_alvo_pct ?? DEFAULT_PREFERENCES.margem_alvo_pct),
          margem_minima_pct: Number(source.margem_minima_pct ?? DEFAULT_PREFERENCES.margem_minima_pct),
          investimento_pct: Number(source.investimento_pct ?? DEFAULT_PREFERENCES.investimento_pct),
          moeda: String(source.moeda ?? DEFAULT_PREFERENCES.moeda),
          ai_tagging_enabled: Boolean((source as Record<string, unknown>).ai_tagging_enabled ?? false),
        });

        const rawPrefs = (userPrefs as { notification_prefs?: unknown } | null)?.notification_prefs;
        if (rawPrefs && typeof rawPrefs === "object") {
          setNotificationPrefs({
            ...DEFAULT_NOTIFICATION_PREFS,
            ...(rawPrefs as Partial<NotificationPrefs>),
          });
        } else {
          await sb.from("user_preferences").upsert(
            { user_id: user.id, notification_prefs: DEFAULT_NOTIFICATION_PREFS, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
        }

        if (roleRes?.ok) {
          const roleData = await roleRes.json() as { isAdmin?: boolean };
          setIsAdmin(Boolean(roleData.isAdmin));
        }
      } catch {
        setError("Falha ao carregar preferências.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCleanupTestProjects = async () => {
    const confirmed = window.confirm("Confirmas a limpeza de projetos de teste (Novo Projeto / sem cliente e valor 0)?");
    if (!confirmed) return;
    setCleanupLoading(true);
    setCleanupResult(null);
    try {
      const response = await fetch("/api/admin/cleanup-test-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string; affected?: number };
      if (!response.ok) {
        setError(payload.error ?? "Falha ao limpar projetos de teste");
      } else {
        setCleanupResult(payload.message ?? `Limpeza concluída (${payload.affected ?? 0} projetos).`);
      }
    } catch {
      setError("Erro de rede durante limpeza de projetos de teste");
    } finally {
      setCleanupLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const { error: err } = await sb.from("preferences").upsert({
      user_id: user.id,
      ...prefs,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleSaveNotifications = async () => {
    setNotifSaving(true);
    setError("");
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      setNotifSaving(false);
      return;
    }

    const { error: err } = await sb.from("user_preferences").upsert({
      user_id: user.id,
      notification_prefs: notificationPrefs,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    setNotifSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2500);
  };

  const field = (label: string, key: keyof PrefsState, min: number, max: number, step = 1, suffix = "%") => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="label" style={{ marginBottom: 0 }}>{label}</label>
        <span className="text-sm font-semibold" style={{ color: "var(--accent-2)" }}>
          {prefs[key]}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={Number(prefs[key])}
        onChange={(e) => setPrefs({ ...prefs, [key]: parseFloat(e.target.value) })}
        className="slider"
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs" style={{ color: "var(--text-3)" }}>{min}{suffix}</span>
        <span className="text-xs" style={{ color: "var(--text-3)" }}>{max}{suffix}</span>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="page-title">Preferências</h1>
        </div>
        <div className="card space-y-4">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-xl"
    >
      <div className="page-header">
        <div>
          <h1 className="page-title">Preferências</h1>
          <p className="page-subtitle">Defaults para novos projetos</p>
        </div>
        <Settings className="h-5 w-5" style={{ color: "var(--text-3)" }} />
      </div>

      <div className="card space-y-6">
        <div>
          <label className="label">Regime de IVA padrão</label>
          <select
            value={prefs.iva_regime}
            onChange={(e) => setPrefs({ ...prefs, iva_regime: e.target.value as IvaRegime })}
            className="input"
          >
            {IVA_REGIMES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <hr className="divider" />
        {field("Overhead", "overhead_pct", 0, 50)}
        {field("Contingência", "contingencia_pct", 0, 30)}
        {field("Margem Alvo", "margem_alvo_pct", 0, 60)}
        {field("Margem Mínima", "margem_minima_pct", 0, 40)}
        {field("Investimento", "investimento_pct", 0, 20)}

        {error && <div className="alert alert-error">{error}</div>}
        {saved && <div className="alert alert-success">Preferências guardadas com sucesso!</div>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary w-full"
        >
          <Save className="h-4 w-4" />
          {saving ? "A guardar…" : "Guardar Preferências"}
        </button>
      </div>

      {/* AI tagging card */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4" style={{ color: "#7c3aed" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Funcionalidades Experimentais</p>
        </div>

        <div className="flex items-center justify-between rounded-xl p-4" style={{ background: "var(--surface-2)" }}>
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>AI Tagging <span className="text-xs px-1.5 py-0.5 rounded ml-1" style={{ background: "rgba(124,58,237,0.15)", color: "#7c3aed" }}>beta</span></p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              Analisa fotos com OpenAI Vision para adicionar tags automáticas. Requer OPENAI_API_KEY no servidor. Desligado por omissão.
            </p>
          </div>
          <button
            onClick={() => setPrefs((p) => ({ ...p, ai_tagging_enabled: !p.ai_tagging_enabled }))}
            className="ml-4 relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
            style={{ background: prefs.ai_tagging_enabled ? "#7c3aed" : "var(--surface-3)" }}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
              style={{ transform: prefs.ai_tagging_enabled ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        <p className="text-xs" style={{ color: "var(--text-3)" }}>
          Tags guardadas em metadata.tags — ficheiros Dropbox nunca são renomeados.
        </p>
      </div>

      {isAdmin ? (
        <div className="card space-y-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Ferramentas Admin (CEO)</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
              Limpa projetos de teste com nome “Novo Projeto” e projetos vazios sem cliente/valor.
            </p>
          </div>
          {cleanupResult ? <div className="alert alert-success">{cleanupResult}</div> : null}
          <button onClick={handleCleanupTestProjects} disabled={cleanupLoading} className="btn btn-secondary">
            {cleanupLoading ? "A limpar..." : "Limpar projetos de teste"}
          </button>
        </div>
      ) : null}

      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: "var(--accent)" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Notificações de Review</p>
        </div>

        {[
          { key: "in_app", label: "Notificações in-app", desc: "Centro de notificações e badges." },
          { key: "email", label: "Notificações por email", desc: "Enviar para email_outbox quando disponível." },
          { key: "new_comments", label: "Novos comentários", desc: "Avisar quando há mensagens novas em reviews." },
          { key: "new_versions", label: "Novas versões", desc: "Avisar quando uma nova versão é publicada." },
          { key: "approvals", label: "Aprovações e decisões", desc: "Avisar em approved / changes requested." },
        ].map((item) => {
          const key = item.key as keyof NotificationPrefs;
          return (
            <div key={item.key} className="flex items-center justify-between rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
              <div className="min-w-0 pr-3">
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{item.label}</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>{item.desc}</p>
              </div>
              <button
                onClick={() => setNotificationPrefs((prev) => ({ ...prev, [key]: !prev[key] }))}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
                style={{ background: notificationPrefs[key] ? "var(--accent)" : "var(--surface-3)" }}
                aria-label={item.label}
              >
                <span
                  className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                  style={{ transform: notificationPrefs[key] ? "translateX(22px)" : "translateX(2px)" }}
                />
              </button>
            </div>
          );
        })}

        {notifSaved && <div className="alert alert-success">Preferências de notificações guardadas!</div>}
        <button onClick={handleSaveNotifications} disabled={notifSaving} className="btn btn-secondary w-full">
          <Save className="h-4 w-4" />
          {notifSaving ? "A guardar notificações…" : "Guardar Notificações"}
        </button>
      </div>
    </motion.div>
  );
}
