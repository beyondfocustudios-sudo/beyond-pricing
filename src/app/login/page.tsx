"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase";
import { Mail, ArrowRight, CheckCircle, AlertCircle, Zap } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (err) {
        setError(err.message);
      } else {
        setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(26,143,163,0.12) 0%, transparent 60%)",
        }}
      />

      {/* Grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
            style={{
              background: "var(--accent)",
              boxShadow: "0 0 40px var(--accent-glow), 0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <Zap className="h-7 w-7 text-white" />
          </motion.div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--text)", letterSpacing: "-0.03em" }}
          >
            Beyond Pricing
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            Plataforma de produção audiovisual
          </p>
        </div>

        {/* Card */}
        <div
          className="card-glass p-6"
          style={{
            background: "rgba(13,17,27,0.8)",
            border: "1px solid var(--border-2)",
            borderRadius: "var(--r-xl)",
            boxShadow: "var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center py-4 space-y-3"
              >
                <div
                  className="mx-auto h-12 w-12 rounded-full flex items-center justify-center"
                  style={{ background: "var(--success-dim)" }}
                >
                  <CheckCircle className="h-6 w-6" style={{ color: "var(--success)" }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: "var(--text)" }}>
                    Magic link enviado!
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
                    Verifica o email{" "}
                    <span className="font-medium" style={{ color: "var(--text)" }}>
                      {email}
                    </span>
                  </p>
                </div>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  O link expira em 1 hora. Não recebeste?{" "}
                  <button
                    className="underline transition"
                    style={{ color: "var(--accent-2)" }}
                    onClick={() => setSent(false)}
                  >
                    Tentar novamente
                  </button>
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <h2
                  className="text-base font-semibold mb-1"
                  style={{ color: "var(--text)" }}
                >
                  Entrar na plataforma
                </h2>
                <p className="text-sm mb-5" style={{ color: "var(--text-2)" }}>
                  Enviamos um link mágico para o teu email
                </p>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="label">
                      Email
                    </label>
                    <div className="relative">
                      <Mail
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                        style={{ color: "var(--text-3)" }}
                      />
                      <input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@exemplo.pt"
                        className="input"
                        style={{ paddingLeft: "2.5rem" }}
                        autoComplete="email"
                        autoFocus
                      />
                    </div>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="alert alert-error"
                      >
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="btn btn-primary btn-lg w-full"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle
                            className="opacity-25"
                            cx="12" cy="12" r="10"
                            stroke="currentColor" strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        A enviar…
                      </span>
                    ) : (
                      <>
                        Enviar Magic Link
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--text-3)" }}>
          Sem passwords. Acesso seguro por link.
        </p>
      </motion.div>
    </div>
  );
}
