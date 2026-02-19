"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { DollarSign, FileText, FolderOpen, Plus } from "lucide-react";

export default function DashboardPage() {
  const [stats, setStats] = useState({ rates: 0, templates: 0, projects: 0 });
  const [projetos, setProjetos] = useState<
    { id: string; project_name: string; client_name: string; status: string; created_at: string }[]
  >([]);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [r, t, p] = await Promise.all([
        supabase.from("rates").select("id", { count: "exact", head: true }),
        supabase.from("templates").select("id", { count: "exact", head: true }),
        supabase
          .from("projects")
          .select("id, project_name, client_name, status, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      setStats({
        rates: r.count ?? 0,
        templates: t.count ?? 0,
        projects: p.data?.length ?? 0,
      });
      setProjetos(p.data ?? []);
    };
    load();
  }, []);

  const cards = [
    { label: "Tarifas", value: stats.rates, icon: DollarSign, href: "/app/rates" },
    { label: "Modelos", value: stats.templates, icon: FileText, href: "/app/templates" },
    { label: "Projetos", value: stats.projects, icon: FolderOpen, href: "/app/projects/new" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Painel</h1>
        <Link href="/app/projects/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          Novo Projeto
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card hover:shadow-md transition">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-sm text-gray-500">{c.label}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {projetos.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Projetos Recentes</h2>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">Projeto</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projetos.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/app/projects/${p.id}`} className="font-medium text-brand-600 hover:underline">
                        {p.project_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.client_name || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 capitalize">
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(p.created_at).toLocaleDateString("pt-PT")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
