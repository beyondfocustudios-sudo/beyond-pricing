'use client';

import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // anti double-submit guard

    if (process.env.NODE_ENV === "development") {
      console.log("[login] submit disparado para:", email);
    }

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[login] Erro Supabase:", error.message);
      }
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-xl shadow text-center">
          <h1 className="text-2xl font-bold mb-4">Verifica o teu email</h1>
          <p className="text-gray-600">
            Enviámos um link de acesso para{" "}
            <strong>{email}</strong>.<br />
            Clica no link para entrar.
          </p>
          <button
            onClick={() => { setSent(false); setLoading(false); }}
            className="mt-6 text-sm text-gray-500 underline"
          >
            Reenviar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow">
        <h1 className="text-2xl font-bold mb-1">Beyond Pricing</h1>
        <p className="text-gray-500 mb-6 text-sm">
          Orçamentos para produção audiovisual
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50"
              placeholder="nome@empresa.pt"
            />
          </div>
          {error && (
            <p className="text-red-500 text-sm rounded bg-red-50 px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "A enviar…" : "Entrar com Magic Link"}
          </button>
        </form>
      </div>
    </main>
  );
}
