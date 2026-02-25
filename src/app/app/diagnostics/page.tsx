"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  CheckCircle2, XCircle, AlertCircle, RefreshCw,
  Database, Key, Shield, User, Server, Zap,
} from "lucide-react";

interface Check {
  label: string;
  status: "ok" | "error" | "warn" | "loading";
  detail?: string;
}

interface OrgRoleData {
  role: string | null;
  isAdmin: boolean;
}

// DEV-only: only render diagnostics in development or if ?force=1
export default function DiagnosticsPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [orgRole, setOrgRole] = useState<OrgRoleData | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const runChecks = async () => {
    setRunning(true);

    const results: Check[] = [];

    // 1. ENV vars
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    results.push({
      label: "NEXT_PUBLIC_SUPABASE_URL",
      status: supabaseUrl ? "ok" : "error",
      detail: supabaseUrl
        ? supabaseUrl.replace(/https?:\/\//, "").split(".")[0] + ".supabase.co"
        : "Variável em falta — adiciona ao .env.local",
    });

    results.push({
      label: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      status: supabaseKey ? "ok" : "error",
      detail: supabaseKey
        ? `…${supabaseKey.slice(-8)}`
        : "Variável em falta",
    });

    setChecks([...results]);

    // 2. Auth check
    const sb = createClient();
    const { data: { user }, error: authErr } = await sb.auth.getUser();

    if (authErr || !user) {
      results.push({
        label: "Autenticação Supabase",
        status: "error",
        detail: authErr?.message ?? "Não autenticado — faz login primeiro",
      });
      setChecks([...results]);
      setRunning(false);
      return;
    }

    setUserEmail(user.email ?? null);
    results.push({
      label: "Autenticação Supabase",
      status: "ok",
      detail: `Sessão válida: ${user.email}`,
    });
    setChecks([...results]);

    // 3. DB table checks
    const TABLES = [
      "projects", "project_members",
      "checklists", "checklist_items",
      "templates", "template_items",
      "clients", "client_users",
      "conversations", "messages",
      "journal_entries", "tasks",
      "crm_contacts", "crm_companies", "crm_deals",
      "team_members", "organizations",
      "catalog_items",
      "call_sheets",
      "notifications",
      "fuel_cache",
      "route_cache",
      "plugin_status",
      "plugin_runs",
    ];

    for (const table of TABLES) {
      const { error } = await sb.from(table).select("id").limit(1);
      results.push({
        label: `Tabela: ${table}`,
        status: error ? "error" : "ok",
        detail: error ? `${error.code}: ${error.message}` : "Acessível via RLS",
      });
      setChecks([...results]);
    }

    // 4. Org role check
    try {
      const roleRes = await fetch("/api/admin/org-role");
      if (roleRes.ok) {
        const roleData = await roleRes.json() as OrgRoleData;
        setOrgRole(roleData);
        results.push({
          label: "Org Role (team_members)",
          status: roleData.role ? "ok" : "warn",
          detail: roleData.role
            ? `Role: ${roleData.role}${roleData.isAdmin ? " (admin ✓)" : ""}`
            : "Sem role — corre /api/admin/bootstrap para atribuir owner",
        });
      } else {
        results.push({
          label: "Org Role (team_members)",
          status: "error",
          detail: "Falha ao verificar role — verifica autenticação",
        });
      }
    } catch {
      results.push({
        label: "Org Role (team_members)",
        status: "error",
        detail: "Erro de rede ao verificar role",
      });
    }

    // 5. Bootstrap endpoint check (HEAD only)
    try {
      const bRes = await fetch("/api/admin/bootstrap", { method: "GET" });
      results.push({
        label: "Bootstrap endpoint",
        status: bRes.ok || bRes.status === 405 ? "ok" : "warn",
        detail: bRes.ok ? "Acessível" : `HTTP ${bRes.status}`,
      });
    } catch {
      results.push({
        label: "Bootstrap endpoint",
        status: "warn",
        detail: "Não acessível",
      });
    }

    // 6. Plugins endpoints
    try {
      const [weatherRes, fuelRes, routeRes] = await Promise.all([
        fetch("/api/plugins/weather?location=Setubal"),
        fetch("/api/plugins/fuel?country=PT&type=diesel"),
        fetch("/api/plugins/route?from=Setubal&to=Lisboa"),
      ]);

      results.push({
        label: "Plugin Weather",
        status: weatherRes.ok ? "ok" : "warn",
        detail: weatherRes.ok ? "API + cache operacional" : `HTTP ${weatherRes.status}`,
      });
      results.push({
        label: "Plugin Fuel",
        status: fuelRes.ok ? "ok" : "warn",
        detail: fuelRes.ok ? "API + cache operacional" : `HTTP ${fuelRes.status}`,
      });
      results.push({
        label: "Plugin Route",
        status: routeRes.ok ? "ok" : "warn",
        detail: routeRes.ok ? "API + cache operacional" : `HTTP ${routeRes.status}`,
      });
    } catch {
      results.push({
        label: "Plugins",
        status: "warn",
        detail: "Falha no ping aos plugins",
      });
    }

    setChecks([...results]);
    setRunning(false);
  };

  useEffect(() => { runChecks(); }, []); // run once on mount

  const StatusIcon = ({ status }: { status: Check["status"] }) => {
    if (status === "ok") return <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />;
    if (status === "error") return <XCircle className="h-4 w-4 shrink-0" style={{ color: "var(--error)" }} />;
    if (status === "warn") return <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "var(--warning)" }} />;
    return (
      <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" style={{ color: "var(--text-3)" }}>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  };

  const okCount = checks.filter((c) => c.status === "ok").length;
  const errCount = checks.filter((c) => c.status === "error").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  const groups = [
    { label: "Variáveis de Ambiente", icon: Key, items: checks.filter((c) => c.label.startsWith("NEXT_PUBLIC")) },
    { label: "Autenticação", icon: Shield, items: checks.filter((c) => c.label.includes("Autenticação")) },
    { label: "Base de Dados", icon: Database, items: checks.filter((c) => c.label.startsWith("Tabela:")) },
    { label: "RBAC & Admin", icon: User, items: checks.filter((c) => c.label.includes("Org Role") || c.label.includes("Bootstrap")) },
    { label: "Plugins & Cache", icon: Zap, items: checks.filter((c) => c.label.startsWith("Plugin") || c.label === "Plugins") },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Server className="h-6 w-6" style={{ color: "var(--accent)" }} />
            Diagnósticos
          </h1>
          <p className="page-subtitle">Estado do sistema — apenas para desenvolvimento</p>
        </div>
        <button
          onClick={runChecks}
          disabled={running}
          className="btn btn-secondary"
        >
          <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
          {running ? "A verificar…" : "Re-executar"}
        </button>
      </div>

      {/* Summary bar */}
      {checks.length > 0 && !running && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center" style={{ border: `1px solid var(--success-border)`, background: "var(--success-bg)" }}>
            <p className="text-2xl font-bold" style={{ color: "var(--success)" }}>{okCount}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-2)" }}>OK</p>
          </div>
          <div className="card text-center" style={{ border: `1px solid var(--warning-border)`, background: "var(--warning-bg)" }}>
            <p className="text-2xl font-bold" style={{ color: "var(--warning)" }}>{warnCount}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-2)" }}>Avisos</p>
          </div>
          <div className="card text-center" style={{ border: `1px solid var(--error-border)`, background: "var(--error-bg)" }}>
            <p className="text-2xl font-bold" style={{ color: "var(--error)" }}>{errCount}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-2)" }}>Erros</p>
          </div>
        </div>
      )}

      {/* Session info */}
      {userEmail && (
        <div
          className="card flex items-center gap-3"
          style={{ background: "var(--accent-dim)", border: "1px solid rgba(26,143,163,0.2)" }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white shrink-0"
            style={{ background: "var(--accent)" }}
          >
            {userEmail[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{userEmail}</p>
            {orgRole && (
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                Role: <strong style={{ color: "var(--accent-2)" }}>{orgRole.role ?? "sem role"}</strong>
                {orgRole.isAdmin && <span style={{ color: "var(--success)" }}> · admin ✓</span>}
              </p>
            )}
          </div>
          <Zap className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
        </div>
      )}

      {/* Grouped checks */}
      {groups.map((group) => (
        group.items.length > 0 && (
          <div key={group.label} className="card space-y-1" style={{ padding: 0, overflow: "hidden" }}>
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}
            >
              <group.icon className="h-4 w-4" style={{ color: "var(--text-3)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{group.label}</p>
              <span className="ml-auto text-xs" style={{ color: "var(--text-3)" }}>
                {group.items.filter((i) => i.status === "ok").length}/{group.items.length} OK
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {group.items.map((check, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <StatusIcon status={check.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{check.label}</p>
                    {check.detail && (
                      <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--text-3)" }}>{check.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ))}

      {/* Bootstrap instructions */}
      {orgRole && !orgRole.role && (
        <div
          className="card space-y-3"
          style={{ border: "1px solid var(--warning-border)", background: "var(--warning-bg)" }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" style={{ color: "var(--warning)" }} />
            <p className="font-semibold" style={{ color: "var(--text)" }}>Sem role org — acções necessárias</p>
          </div>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Para atribuir role de owner, abre uma nova aba e visita:
          </p>
          <a
            href="/api/admin/bootstrap"
            target="_blank"
            className="btn btn-primary btn-sm"
            rel="noopener noreferrer"
          >
            Abrir /api/admin/bootstrap
          </a>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            Requer OWNER_EMAIL em .env.local a coincidir com o teu email de login.
          </p>
        </div>
      )}

      {/* Raw checks table */}
      {checks.length > 0 && (
        <details className="card">
          <summary
            className="cursor-pointer text-sm font-medium py-1"
            style={{ color: "var(--text-2)" }}
          >
            Ver todos os resultados ({checks.length})
          </summary>
          <div className="mt-3 space-y-1">
            {checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2 py-1" style={{ borderBottom: "1px solid var(--border)" }}>
                <StatusIcon status={c.status} />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{c.label}</span>
                  {c.detail && <span className="text-xs ml-2 font-mono" style={{ color: "var(--text-3)" }}>{c.detail}</span>}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
