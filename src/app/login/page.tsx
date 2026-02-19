"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setErro(error.message);
    } else {
      setEnviado(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Beyond Pricing</h1>
          <p className="mt-1 text-sm text-gray-500">
            Inicia sessão com o teu email
          </p>
        </div>

        {enviado ? (
          <div className="card text-center">
            <p className="text-green-700 font-medium">
              Verifica a tua caixa de email!
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Enviámos um link mágico para <strong>{email}</strong>. Clica no
              link para entrar.
            </p>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="card space-y-4">
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@exemplo.pt"
                className="input"
              />
            </div>

            {erro && <p className="text-sm text-red-600">{erro}</p>}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "A enviar…" : "Enviar Magic Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
