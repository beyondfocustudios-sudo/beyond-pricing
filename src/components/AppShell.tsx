"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  LayoutDashboard,
  DollarSign,
  FileText,
  FolderOpen,
  LogOut,
} from "lucide-react";

const nav = [
  { href: "/app", label: "Painel", icon: LayoutDashboard },
  { href: "/app/rates", label: "Tarifas", icon: DollarSign },
  { href: "/app/templates", label: "Modelos", icon: FileText },
  { href: "/app/projects/new", label: "Novo Projeto", icon: FolderOpen },
];

export function AppShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center border-b border-gray-200 px-4">
          <Link href="/app" className="text-lg font-bold text-brand-700">
            Beyond Pricing
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          {nav.map((item) => {
            const active =
              item.href === "/app"
                ? pathname === "/app"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <p className="truncate text-xs text-gray-500 mb-2">{userEmail}</p>
          <button onClick={handleLogout} className="btn-secondary w-full text-xs">
            <LogOut className="h-3 w-3" />
            Terminar sessão
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="md:hidden flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
          <Link href="/app" className="text-lg font-bold text-brand-700">
            Beyond Pricing
          </Link>
          <button onClick={handleLogout} className="text-sm text-gray-500">
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* Mobile nav */}
        <nav className="md:hidden flex border-b border-gray-200 bg-white overflow-x-auto">
          {nav.map((item) => {
            const active =
              item.href === "/app"
                ? pathname === "/app"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-xs font-medium border-b-2 ${
                  active
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-gray-500"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
