"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bell,
  CalendarDays,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Moon,
  PhoneCall,
  Search,
  ShieldCheck,
  Sun,
  Zap,
} from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import HQAssistantWidget from "@/components/HQAssistantWidget";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { useTheme } from "@/components/ThemeProvider";
import { buttonMotionProps, transitions, useMotionEnabled } from "@/lib/motion";

type PortalShellProps = {
  children: React.ReactNode;
  email: string | null;
  displayName: string | null;
  impersonation: { clientId: string; clientName: string; expiresAt: string } | null;
  onLogout: () => Promise<void>;
};

type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    key: "dashboard",
    href: "/portal",
    label: "Dashboard",
    icon: LayoutDashboard,
    isActive: (pathname) => pathname === "/portal",
  },
  {
    key: "projects",
    href: "/portal/projects",
    label: "Projetos",
    icon: FolderKanban,
    isActive: (pathname) => pathname.startsWith("/portal/projects"),
  },
  {
    key: "deliveries",
    href: "/portal/projects?focus=deliveries",
    label: "Entregas",
    icon: Zap,
    isActive: (pathname) => pathname.startsWith("/portal/review"),
  },
  {
    key: "messages",
    href: "/portal/projects?focus=inbox",
    label: "Mensagens",
    icon: MessageCircle,
    isActive: (pathname) => pathname.includes("/portal/inbox"),
  },
  {
    key: "calendar",
    href: "/portal/projects?focus=calendar",
    label: "Agenda",
    icon: CalendarDays,
    isActive: (pathname) => pathname.includes("calendar"),
  },
];

function buildLinkWithImpersonation(href: string, token: string | null) {
  if (!token) return href;
  const hasQuery = href.includes("?");
  return `${href}${hasQuery ? "&" : "?"}impersonate=${encodeURIComponent(token)}`;
}

export default function PortalShell({
  children,
  email,
  displayName,
  impersonation,
  onLogout,
}: PortalShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const motionEnabled = useMotionEnabled();
  const { theme, toggleTheme } = useTheme();

  const impersonationToken = searchParams.get("impersonate");
  const [query, setQuery] = useState("");

  const greetingName = useMemo(() => {
    if (displayName && displayName.trim().length > 0) {
      return displayName.trim().split(" ")[0];
    }
    if (email && email.includes("@")) {
      return email.split("@")[0];
    }
    return "Cliente";
  }, [displayName, email]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    const base = "/portal/projects";
    const params = new URLSearchParams();
    if (term.length > 0) params.set("q", term);
    if (impersonationToken) params.set("impersonate", impersonationToken);
    router.push(params.toString().length > 0 ? `${base}?${params.toString()}` : base);
  };

  const calendlyUrl = process.env.NEXT_PUBLIC_CALENDLY_URL ?? "https://calendly.com";

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverflowX = document.body.style.overflowX;
    const prevOverflowY = document.body.style.overflowY;
    document.body.style.overflow = "auto";
    document.body.style.overflowX = "hidden";
    document.body.style.overflowY = "auto";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overflowX = prevOverflowX;
      document.body.style.overflowY = prevOverflowY;
    };
  }, []);

  return (
    <div className="super-theme portal-ref-bg h-dvh w-full overflow-y-auto">
      <OnboardingGate surface="portal" />

      <div className="portal-ref-shell">
        <aside className="portal-ref-sidebar hidden md:flex">
          <Link href={buildLinkWithImpersonation("/portal", impersonationToken)} className="portal-ref-brand" aria-label="Portal">
            <Zap className="h-4 w-4" />
          </Link>

          <nav className="portal-ref-nav" aria-label="Portal navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.isActive(pathname);
              return (
                <Link
                  key={item.key}
                  href={buildLinkWithImpersonation(item.href, impersonationToken)}
                  className={`portal-ref-nav-item ${active ? "is-active" : ""}`}
                  aria-label={item.label}
                  title={item.label}
                >
                  {active ? (
                    <motion.span
                      layoutId="portal-ref-active-pill"
                      className="portal-ref-nav-active"
                      transition={transitions.ui}
                    />
                  ) : null}
                  <Icon className="relative z-[1] h-4 w-4" />
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            className="portal-ref-nav-item mt-auto"
            onClick={() => void onLogout()}
            title="Sair"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </aside>

        <div className="portal-ref-main">
          <header className="portal-ref-header">
            <div className="min-w-0">
              <p className="portal-ref-kicker">Olá, {greetingName}</p>
              <p className="portal-ref-subtitle">Explora entregas, feedback e próximos passos do teu projeto.</p>
            </div>

            <div className="portal-ref-header-actions">
              <form onSubmit={handleSearch} className="portal-ref-search">
                <Search className="h-4 w-4" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Pesquisar projetos, entregas, mensagens"
                  aria-label="Pesquisar"
                />
              </form>

              <motion.button
                type="button"
                className="portal-ref-icon-btn"
                onClick={toggleTheme}
                title={theme === "dark" ? "Modo claro" : "Modo escuro"}
                aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"}
                {...buttonMotionProps({ enabled: motionEnabled })}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </motion.button>

              <motion.button
                type="button"
                className="portal-ref-icon-btn"
                title="Notificações"
                aria-label="Notificações"
                onClick={() => router.push(buildLinkWithImpersonation("/portal/projects?focus=inbox", impersonationToken))}
                {...buttonMotionProps({ enabled: motionEnabled })}
              >
                <Bell className="h-4 w-4" />
              </motion.button>

              <motion.button
                type="button"
                className="portal-ref-icon-btn"
                onClick={() => void onLogout()}
                title="Sair"
                aria-label="Sair"
                {...buttonMotionProps({ enabled: motionEnabled })}
              >
                <LogOut className="h-4 w-4" />
              </motion.button>
            </div>
          </header>

          {impersonation ? (
            <div className="portal-ref-banner">
              Modo visualização cliente ativo: <strong>{impersonation.clientName}</strong>
              {" · "}
              expira {new Date(impersonation.expiresAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
            </div>
          ) : null}

          <main className="portal-ref-content">
            <ErrorBoundary label="portal">
              {children}
            </ErrorBoundary>
          </main>
        </div>

        <aside className="portal-ref-right-rail hidden xl:flex">
          <motion.article className="card p-4" {...buttonMotionProps({ enabled: motionEnabled, hoverY: -2 })}>
            <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Perfil</p>
            <p className="mt-2 text-base font-semibold" style={{ color: "var(--text)" }}>{displayName ?? "Cliente Beyond"}</p>
            <p className="text-xs" style={{ color: "var(--text-2)" }}>{email ?? "sem email"}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl border px-2 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <p style={{ color: "var(--text-3)" }}>Conta</p>
                <p className="font-semibold" style={{ color: "var(--text)" }}>Ativa</p>
              </div>
              <div className="rounded-xl border px-2 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <p style={{ color: "var(--text-3)" }}>Modo</p>
                <p className="font-semibold" style={{ color: "var(--text)" }}>Cliente</p>
              </div>
              <div className="rounded-xl border px-2 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <p style={{ color: "var(--text-3)" }}>Portal</p>
                <p className="font-semibold" style={{ color: "var(--text)" }}>Online</p>
              </div>
            </div>
          </motion.article>

          <motion.article className="card p-4" {...buttonMotionProps({ enabled: motionEnabled, hoverY: -2 })}>
            <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Marcar call</p>
            <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
              Agenda uma call rápida com a equipa para alinhamento de entregas.
            </p>
            <a className="btn btn-primary btn-sm mt-3 w-full" href={calendlyUrl} target="_blank" rel="noreferrer">
              <PhoneCall className="h-4 w-4" /> Abrir Calendly
            </a>
          </motion.article>

          <motion.article className="card p-4" {...buttonMotionProps({ enabled: motionEnabled, hoverY: -2 })}>
            <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>Segurança</p>
            <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>
              Atualiza password e mantém o acesso protegido.
            </p>
            <Link className="btn btn-secondary btn-sm mt-3 w-full" href="/reset-password">
              <ShieldCheck className="h-4 w-4" /> Atualizar password
            </Link>
          </motion.article>
        </aside>
      </div>

      <nav className="portal-ref-mobile-nav md:hidden" aria-label="Mobile portal navigation">
        {navItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.key}
              href={buildLinkWithImpersonation(item.href, impersonationToken)}
              className={`portal-ref-mobile-link ${active ? "is-active" : ""}`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <HQAssistantWidget />
    </div>
  );
}
