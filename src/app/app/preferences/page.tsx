"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { IVA_REGIMES, DEFAULT_PREFERENCES, type IvaRegime } from "@/lib/types";
import { Save, Settings } from "lucide-react";

interface PrefsState {
  iva_regime: IvaRegime;
  overhead_pct: number;
  contingencia_pct: number;
  margem_alvo_pct: number;
  margem_minima_pct: number;
  investimento_pct: number;
  moeda: string;
}

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<PrefsState>({ ...DEFAULT_PREFERENCES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb.from("preferences").select("*").eq("user_id", user.id).single();
      if (data) {
        setPrefs({
          iva_regime: data.iva_regime ?? DEFAULT_PREFERENCES.iva_regime,
          overhead_pct: data.overhead_pct ?? DEFAULT_PREFERENCES.overhead_pct,
          contingencia_pct: data.contingencia_pct ?? DEFAULT_PREFERENCES.contingencia_pct,
          margem_alvo_pct: data.margem_alvo_pct ?? DEFAULT_PREFERENCES.margem_alvo_pct,
          margem_minima_pct: data.margem_minima_pct ?? DEFAULT_PREFERENCES.margem_minima_pct,
          investimento_pct: data.investimento_pct ?? DEFAULT_PREFERENCES.investimento_pct,
          moeda: data.moeda ?? DEFAULT_PREFERENCES.moeda,
        });
      }
      setLoading(false);
    };
    load();
  }, []);

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
    </motion.div>
  );
}
