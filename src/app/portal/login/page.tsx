"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const sb = createClient();
    const { error: authErr } = await sb.auth.signInWithPassword({ email, password });

    if (authErr) {
      setError("Email ou password incorretos. Verifica os teus dados.");
      setLoading(false);
      return;
    }

    router.push("/portal");
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const sb = createClient();
    const { error: resetErr } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/portal/login`,
    });

    if (resetErr) {
      setError("Erro ao enviar email de recuperação. Tenta novamente.");
    } else {
      setResetSent(true);
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #e8f4f6 0%, #f5f5f7 50%, #e8f0f6 100%)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
            style={{ background: "linear-gradient(135deg, #1a8fa3, #0d6b7e)" }}
          >
            <span className="text-2xl font-bold text-white">B</span>
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "#1d1d1f" }}>
            Portal do Cliente
          </h1>
          <p className="text-sm mt-1" style={{ color: "#86868b" }}>
            Beyond Focus Studios
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            boxShadow: "0 4px 40px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.6) inset",
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          {resetSent ? (
            <div className="text-center py-4">
              <div className="h-12 w-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: "#e8f8f2" }}>
                <Mail className="h-6 w-6" style={{ color: "#34d399" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#1d1d1f" }}>Email enviado!</p>
              <p className="text-xs mt-1" style={{ color: "#86868b" }}>
                Verifica a tua caixa de entrada para recuperar a password.
              </p>
              <button
                onClick={() => { setMode("login"); setResetSent(false); }}
                className="mt-4 text-xs font-medium"
                style={{ color: "#1a8fa3" }}
              >
                Voltar ao login
              </button>
            </div>
          ) : mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: "#1d1d1f" }}>
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#86868b" }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="o.teu@email.com"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: "rgba(0,0,0,0.04)",
                      border: "1px solid rgba(0,0,0,0.1)",
                      color: "#1d1d1f",
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: "#1d1d1f" }}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#86868b" }} />
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm outline-none"
                    style={{
                      background: "rgba(0,0,0,0.04)",
                      border: "1px solid rgba(0,0,0,0.1)",
                      color: "#1d1d1f",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "#86868b" }}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: "#fef2f2", color: "#dc2626" }}>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                style={{
                  background: loading ? "#86868b" : "linear-gradient(135deg, #1a8fa3, #0d6b7e)",
                  boxShadow: loading ? "none" : "0 2px 12px rgba(26,143,163,0.35)",
                }}
              >
                {loading ? "A entrar…" : "Entrar"}
              </button>

              {/* Forgot password */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setMode("reset")}
                  className="text-xs"
                  style={{ color: "#1a8fa3" }}
                >
                  Esqueci a password
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium" style={{ color: "#1d1d1f" }}>Recuperar password</p>
                <p className="text-xs" style={{ color: "#86868b" }}>Vamos enviar um link de recuperação para o teu email.</p>
              </div>

              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#86868b" }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="o.teu@email.com"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.1)",
                    color: "#1d1d1f",
                  }}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: "#fef2f2", color: "#dc2626" }}>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: loading ? "#86868b" : "linear-gradient(135deg, #1a8fa3, #0d6b7e)" }}
              >
                {loading ? "A enviar…" : "Enviar email de recuperação"}
              </button>

              <div className="text-center">
                <button type="button" onClick={() => setMode("login")} className="text-xs" style={{ color: "#1a8fa3" }}>
                  Voltar ao login
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#86868b" }}>
          © {new Date().getFullYear()} Beyond Focus Studios
        </p>
      </motion.div>
    </div>
  );
}
