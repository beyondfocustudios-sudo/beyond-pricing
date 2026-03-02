"use client";

import { motion } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  CheckSquare,
  Inbox,
  CalendarDays,
  FolderKanban,
  FileText,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Briefcase,
  Calculator,
  UserSquare2,
  Link2,
  Wallet,
  Home,
  ListTodo,
  MessageSquare,
  Files,
  Clock,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Area = "ceo" | "empresa" | "freelancer";

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

const NAV_ITEMS: Record<Area, NavItem[]> = {
  ceo: [
    { icon: LayoutDashboard, label: "Dashboard",   href: "/ceo" },
    { icon: BookOpen,         label: "Journal",     href: "/ceo/journal" },
    { icon: CheckSquare,      label: "Tarefas",     href: "/ceo/tasks" },
    { icon: Inbox,            label: "Inbox",       href: "/ceo/inbox" },
    { icon: CalendarDays,     label: "Calendário",  href: "/ceo/calendar" },
    { icon: FolderKanban,     label: "Projetos",    href: "/ceo/projects" },
    { icon: FileText,         label: "Documentos",  href: "/ceo/documents" },
    { icon: Users,            label: "Clientes",    href: "/ceo/clients" },
    { icon: BarChart3,        label: "Insights",    href: "/ceo/insights" },
  ],
  empresa: [
    { icon: LayoutDashboard, label: "Dashboard",    href: "/empresa" },
    { icon: Briefcase,        label: "Operações",   href: "/empresa/operacoes" },
    { icon: FolderKanban,     label: "Projetos",    href: "/empresa/projetos" },
    { icon: Calculator,       label: "Orçamentos",  href: "/empresa/orcamentos" },
    { icon: UserSquare2,      label: "Clientes",    href: "/empresa/clientes" },
    { icon: Inbox,            label: "Inbox",       href: "/empresa/inbox" },
    { icon: Users,            label: "Equipa",      href: "/empresa/equipa" },
    { icon: Link2,            label: "Integrações", href: "/empresa/integracoes" },
    { icon: Wallet,           label: "Financeiro",  href: "/empresa/financeiro" },
  ],
  freelancer: [
    { icon: Home,             label: "Home",        href: "/freelancer" },
    { icon: FolderKanban,     label: "Projetos",    href: "/freelancer/projetos" },
    { icon: ListTodo,         label: "Tarefas",     href: "/freelancer/tarefas" },
    { icon: MessageSquare,    label: "Mensagens",   href: "/freelancer/mensagens" },
    { icon: Files,            label: "Ficheiros",   href: "/freelancer/ficheiros" },
    { icon: Clock,            label: "Timesheet",   href: "/freelancer/timesheet" },
  ],
};

const BOTTOM_ITEMS: Record<Area, NavItem[]> = {
  ceo: [
    { icon: Settings, label: "Definições", href: "/ceo/settings" },
    { icon: LogOut,   label: "Sair",       href: "/login" },
  ],
  empresa: [
    { icon: Settings, label: "Definições", href: "/empresa/settings" },
    { icon: LogOut,   label: "Sair",       href: "/login" },
  ],
  freelancer: [
    { icon: UserSquare2, label: "Perfil", href: "/freelancer/perfil" },
    { icon: LogOut,      label: "Sair",   href: "/login" },
  ],
};

interface SidebarProps {
  area: Area;
}

export function Sidebar({ area }: SidebarProps) {
  const pathname = usePathname();
  const mainItems = NAV_ITEMS[area];
  const bottomItems = BOTTOM_ITEMS[area];

  function isActive(href: string): boolean {
    if (pathname === href) return true;
    if (href !== `/${area}` && pathname.startsWith(`${href}/`)) return true;
    return false;
  }

  return (
    <motion.aside
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full w-16 flex-col items-center gap-1 border-r py-4"
      style={{
        background: "var(--surface, #fff)",
        borderColor: "var(--border, rgba(0,0,0,0.08))",
        width: "64px",
        minWidth: "64px",
      }}
    >
      {/* Logo mark */}
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "#1B4965" }}>
        <span className="text-xs font-bold text-white">BF</span>
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col items-center gap-1">
        {mainItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
            >
              <motion.div
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
                style={{
                  background: active ? "#1B4965" : "transparent",
                  color: active ? "#fff" : "var(--text-3, #94A3B8)",
                }}
              >
                <Icon size={18} />
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col items-center gap-1 border-t pt-3" style={{ borderColor: "var(--border, rgba(0,0,0,0.08))" }}>
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const isLogout = item.href === "/login";
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
            >
              <motion.div
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-black/5"
                style={{ color: isLogout ? "#EF4444" : "var(--text-3, #94A3B8)" }}
              >
                <Icon size={18} />
              </motion.div>
            </Link>
          );
        })}
      </div>
    </motion.aside>
  );
}
