"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { ThemeProvider } from "@/components/ThemeProvider";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/portal/login");
        return;
      }
      setEmail(data.user.email ?? null);
      setLoading(false);
    });
  }, [router]);

  const handleLogout = async () => {
    const sb = createClient();
    await sb.auth.signOut();
    router.push("/portal/login");
  };

  // Don't render layout on login page
  if (pathname === "/portal/login") {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  if (loading) {
    return (
      <ThemeProvider>
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
          <div className="h-8 w-8 rounded-full border-2 animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        {/* Top bar */}
        <header style={{
          background: "var(--glass-bg)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}>
          <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link href="/portal" className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: "var(--accent)" }}>
                <span className="text-xs font-bold text-white">B</span>
              </div>
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Beyond Portal</span>
            </Link>

            <div className="flex items-center gap-3">
              <span className="text-xs hidden sm:block" style={{ color: "var(--text-3)" }}>{email}</span>
              <button
                onClick={handleLogout}
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--text-3)" }}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sair
              </button>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}
